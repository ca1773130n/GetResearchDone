# Evaluation Plan: Phase 62 — Oversized Module Decomposition & Migration

**Designed:** 2026-03-02
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Monolithic-module decomposition — barrel re-export pattern with CJS proxy
**Reference papers:** N/A — engineering refactoring phase, not experimental

## Evaluation Overview

Phase 62 decomposes three monolithic modules (commands.js at 2,848 lines, context.js at 2,546 lines,
evolve.ts at 2,687 lines — 8,081 lines total) into 21+ focused sub-modules organized under three new
directories (lib/commands/, lib/context/, lib/evolve/). Each monolithic file is replaced by a CJS proxy
that re-exports through a barrel index.ts. All sub-modules are TypeScript under strict:true with no any
types in exported function signatures.

The dominant proxy metric for correctness is behavioral equivalence: the pre-existing unit test suites
for commands (231 tests, 4,088 lines), context (199 tests, 3,031 lines), and evolve (170 tests, 2,672
lines) must pass without modification. These test files exercise the module.exports shape of the
originals — if any export is missing from the barrel, or if a sub-module introduces a logic error during
extraction, the corresponding test will fail. The tests run via the CJS proxy chain (commands.js ->
commands/index.ts -> sub-modules), providing end-to-end validation of the entire re-export stack at the
unit test level.

Three concerns are unique to Phase 62 versus prior migration phases:

1. **Sub-module line budget**: Each sub-module must stay under 600 lines. This prevents re-creating the
   god-file problem inside the subdirectories. The 600-line threshold is directly measurable via wc -l.

2. **Export completeness**: The barrels must re-export every symbol from the original module.exports.
   commands exports 32 symbols, context exports 46 symbols, evolve exports 39 symbols. Missing exports
   cause silent import failures in bin/grd-tools.js and lib/mcp-server.js at runtime.

3. **Cross-sub-module typed imports**: Some sub-modules consume others within the same directory
   (e.g., commands/dashboard.ts imports readCachedRoadmap from commands/phase-info.ts). These
   intra-directory imports must use the require-as typed cast pattern and must not introduce circular
   dependencies.

The wave structure is: Wave 1 (plans 62-01, 62-02, 62-03 — evolve, commands part 1, context) runs in
parallel as each module is independent. Wave 2 (plan 62-04 — commands part 2) depends on Wave 1's
commands part 1 because dashboard.ts and health.ts import from phase-info.ts. Wave 3 (plan 62-05 —
jest.config.js update + full verification) depends on all prior waves.

The deferred validation scope extends DEFER-62-01: barrel re-export backward compatibility under real
CLI/MCP invocation (plain node bin/grd-tools.js without ts-jest) remains unvalidated until Phase 65,
consistent with the CJS interop strategy established in Phases 59-61.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Sub-module line count <= 600 | Phase 62 success criteria #5 | Directly measures the anti-god-file decomposition goal |
| tsc --noEmit zero errors | Success criteria #4 (strict:true, no any) | Primary indicator of correct TypeScript annotation across all sub-modules |
| Zero any types in exported functions | Success criteria #4 | Enforces the no-any constraint at module export boundaries |
| Per-module unit test pass (commands, context, evolve) | Success criteria #7 | 600 tests directly exercise the exported function contracts being decomposed |
| Export count parity with original | Success criteria #6 (zero breakage) | Missing barrel re-exports cause silent import failures in grd-tools.js |
| CJS proxy line count ~17 lines | Success criteria (barrel re-exports) | Confirms monolithic files converted to proxies, not still containing implementations |
| Full npm test (2,676+ tests) | Success criteria #7 | Zero regressions across entire codebase including all consumers |
| jest.config.js threshold keys updated | Plan 62-05 must_haves | Coverage tracking must follow files to new barrel entry points |
| Total line count within 15% of 8,081 | Plan 62-05 must_haves | Guards against decomposition bloat from excessive type annotation overhead |
| Consumer resolution (grd-tools.js, mcp-server.js) | Success criteria #6 | The two primary consumers must still resolve all imports through CJS proxies |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 20 | Compilation, no-any, file existence, line count, proxy pattern, export count, cross-module import checks — organized by wave |
| Proxy (L2) | 7 | Per-module test suites (3 modules) + full regression gate + consumer resolution checks |
| Deferred (L3) | 2 | Runtime CJS interop under plain Node.js; real CLI/MCP invocation validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

Sanity checks are organized by wave. Wave-level checks must pass before proceeding to the next wave.

---

### Wave 1 — Plans 62-01, 62-02, 62-03: evolve decomposition, commands part 1, context

### S1: lib/evolve/ directory structure — 7+ sub-modules exist
- **What:** All 7 evolve sub-module files are present on disk: types.ts, state.ts, discovery.ts, scoring.ts, orchestrator.ts, cli.ts, index.ts (plus optional _dimensions.ts, _prompts.ts)
- **Command:** `ls /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/*.ts`
- **Expected:** At minimum 7 .ts files; index.ts present; no evolve.ts file remains at the lib/ root (it was deleted in Plan 62-01)
- **Failure means:** One or more sub-modules were not created, or the monolithic evolve.ts was not deleted; re-run Plan 62-01 Task 2

### S2: tsc --noEmit passes on all evolve sub-modules
- **What:** TypeScript compiler accepts all lib/evolve/*.ts files under strict mode with no errors or warnings
- **Command:** `npx tsc --noEmit 2>&1 | grep 'lib/evolve'`
- **Expected:** No output (zero diagnostics for lib/evolve/* files); the broader `npx tsc --noEmit` must also exit 0
- **Failure means:** A sub-module has annotation errors or cross-sub-module type mismatches (e.g., types.ts interface shape doesn't match usage in state.ts); inspect tsc output to identify the file and fix before Wave 2 begins

### S3: Zero any types in evolve sub-module exported function signatures
- **What:** None of the lib/evolve/*.ts files uses any as a type annotation in exported function parameters or return types
- **Command:** `grep -rn ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/`
- **Expected:** No output (zero matches in type annotation positions)
- **Failure means:** An any escape hatch was introduced during decomposition; replace with the appropriate interface from types.ts or use Record<string, unknown> with narrowing

### S4: No evolve sub-module exceeds 600 lines
- **What:** Every file in lib/evolve/ is at or under 600 lines (the anti-god-file constraint)
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/*.ts`
- **Expected:** Every file shows <= 600 lines; the total should be within 15% of the original 2,687 lines (i.e., under 3,090 total)
- **Failure means:** A sub-module is too large — either split into a private helper (e.g., _dimensions.ts or _prompts.ts) or redistribute content per Plan 62-01 instructions

### S5: lib/evolve/index.ts re-exports all 39 evolve symbols
- **What:** The barrel index.ts re-exports every symbol originally exported from lib/evolve.ts
- **Command:** `node -e "const e = require('/Users/neo/Developer/Projects/GetResearchDone/lib/evolve'); console.log(Object.keys(e).length + ' exports (expected >= 39)')" 2>&1`
- **Expected:** 39 or more exports; all symbols from the original evolve module are accessible through the barrel
- **Failure means:** One or more exports were dropped during decomposition; the barrel is missing a re-export line; reconcile against the original export list in lib/evolve.ts before decomposition

### S6: lib/evolve.js CJS proxy points to lib/evolve/index.ts
- **What:** lib/evolve.js is a thin CJS proxy (~17 lines) re-exporting from lib/evolve/index.ts, not the original monolithic implementation
- **Command:** `grep "require.*evolve/index" /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.js && wc -l < /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.js`
- **Expected:** Matches the proxy pattern; wc -l shows 10-25 lines (not 2,687)
- **Failure means:** evolve.js was not updated to point to the new barrel; apply the CJS proxy pattern from Plan 62-01 Task 2

### S7: 7 commands part-1 sub-modules exist under lib/commands/
- **What:** The 7 sub-modules from Plan 62-02 are on disk: slug-timestamp.ts, todo.ts, config.ts, phase-info.ts, progress.ts, long-term-roadmap.ts, quality.ts
- **Command:** `for f in slug-timestamp todo config phase-info progress long-term-roadmap quality; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/commands/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done`
- **Expected:** All 7 lines show `OK`
- **Failure means:** One or more sub-modules were not created; re-run Plan 62-02 tasks for the missing file

### S8: tsc --noEmit passes on all commands part-1 sub-modules
- **What:** The 7 Wave 1 commands sub-modules compile under strict mode without errors
- **Command:** `npx tsc --noEmit 2>&1 | grep 'lib/commands'`
- **Expected:** No output (zero diagnostics for lib/commands/* files at this stage)
- **Failure means:** A sub-module has annotation errors; inspect tsc output and fix the flagged expression per the require-as typed cast pattern established in Phases 59-61

### S9: No commands part-1 sub-module exceeds 600 lines
- **What:** Each of the 7 Plan 62-02 sub-modules is at or under 600 lines
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/lib/commands/slug-timestamp.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/todo.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/config.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/phase-info.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/progress.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/long-term-roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/quality.ts`
- **Expected:** Each file <= 600 lines
- **Failure means:** A section was placed in the wrong sub-module; redistribute per Plan 62-02's line-count guidance

### S10: lib/context/ directory structure — 7 sub-modules exist and context.js is a proxy
- **What:** All 7 context sub-modules are present: base.ts, execute.ts, project.ts, research.ts, agents.ts, progress.ts, index.ts; lib/context.js is a thin proxy
- **Command:** `for f in base execute project research agents progress index; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/context/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done && grep "require.*context/index" /Users/neo/Developer/Projects/GetResearchDone/lib/context.js && echo "context.js proxy: OK"`
- **Expected:** All 7 sub-module lines show `OK`; context.js proxy pattern confirmed
- **Failure means:** One or more sub-modules missing, or context.js not yet converted; re-run Plan 62-03 tasks

### S11: tsc --noEmit passes on all context sub-modules
- **What:** All lib/context/*.ts files compile cleanly under strict mode — including context/base.ts cross-imports consumed by execute.ts, project.ts, research.ts, and agents.ts
- **Command:** `npx tsc --noEmit 2>&1 | grep 'lib/context'`
- **Expected:** No output (zero diagnostics for lib/context/* files)
- **Failure means:** Cross-sub-module type contract failure (e.g., buildInitContext return type from base.ts doesn't satisfy how execute.ts uses it); inspect tsc output for the specific interface mismatch

### S12: No context sub-module exceeds 600 lines
- **What:** Each of the 7 Plan 62-03 sub-modules is at or under 600 lines
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/lib/context/*.ts`
- **Expected:** Every file shows <= 600 lines; context.js shows 10-25 lines (proxy)
- **Failure means:** The execute.ts or research.ts module is too large (each was planned near the 600 limit); split long build*Prompt functions into a private helper per Plan 62-03

### S13: lib/context/index.ts re-exports all 46 context symbols
- **What:** The context barrel re-exports every symbol originally in lib/context.js module.exports
- **Command:** `node -e "const c = require('/Users/neo/Developer/Projects/GetResearchDone/lib/context'); console.log(Object.keys(c).length + ' exports (expected >= 46)')" 2>&1`
- **Expected:** 46 or more exports (current count is 46 as verified above)
- **Failure means:** The barrel is missing re-exports for one or more cmdInit* functions; reconcile against the original module.exports list

---

### Wave 2 — Plan 62-04: commands part 2 (dashboard, health, search + barrel + CJS proxy)

### S14: 3 remaining commands sub-modules exist + barrel + CJS proxy
- **What:** dashboard.ts, health.ts, search.ts, index.ts exist; lib/commands.js is a thin proxy
- **Command:** `for f in dashboard health search index; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/commands/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done && grep "require.*commands/index" /Users/neo/Developer/Projects/GetResearchDone/lib/commands.js && echo "commands.js proxy: OK"`
- **Expected:** All 4 sub-module lines show `OK`; commands.js proxy pattern confirmed
- **Failure means:** Plan 62-04 Task 2 did not complete or was not committed; re-run

### S15: No Wave 2 commands sub-module exceeds 600 lines
- **What:** dashboard.ts, health.ts, and search.ts are each at or under 600 lines
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/lib/commands/dashboard.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/health.ts /Users/neo/Developer/Projects/GetResearchDone/lib/commands/search.ts`
- **Expected:** Each file <= 600 lines (dashboard was planned at ~550 lines, the most constrained)
- **Failure means:** dashboard.ts exceeds 600 lines — extract the internal parse* helpers into a _dashboard-parsers.ts private helper per Plan 62-04 Task 1 instructions

### S16: tsc --noEmit passes after full Wave 2 (complete Phase 62 compilation)
- **What:** All lib/commands/*.ts, lib/context/*.ts, lib/evolve/*.ts files compile under strict mode — the complete decomposed lib/ surface
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostics across the entire project
- **Failure means:** A cross-sub-module import chain has a type error (e.g., dashboard.ts consuming readCachedRoadmap from phase-info.ts with incompatible type assumptions); inspect tsc output to identify the specific file and boundary

### S17: lib/commands/index.ts re-exports all 32 commands symbols
- **What:** The commands barrel re-exports every symbol from the original commands.js module.exports
- **Command:** `node -e "const c = require('/Users/neo/Developer/Projects/GetResearchDone/lib/commands'); console.log(Object.keys(c).length + ' exports (expected >= 32)')" 2>&1`
- **Expected:** 32 or more exports (current count is 32 as verified above, including 4 requirements re-exports)
- **Failure means:** One or more exports dropped during decomposition; reconcile the barrel index.ts against the original module.exports enumeration in Plan 62-04 Task 2

---

### Wave 3 — Plan 62-05: jest.config.js updates + full verification

### S18: jest.config.js threshold keys updated for all three barrels
- **What:** Coverage threshold keys in jest.config.js reference the new barrel entry points for all three decomposed modules
- **Command:** `grep -E 'commands/index\.ts|context/index\.ts|evolve/index\.ts' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js`
- **Expected:** 3 matching lines showing the new barrel paths; no old monolithic path keys (commands.js, context.js, evolve.ts) remain
- **Failure means:** jest.config.js was not updated in Plan 62-05 Task 1; apply the threshold key rename per plan instructions

### S19: No threshold values were lowered
- **What:** The numeric threshold values for lines, functions, and branches are unchanged or higher compared to the pre-Phase 62 baselines
- **Command:** `grep -A1 'commands/index\|context/index\|evolve/index' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js`
- **Expected:** commands/index.ts: lines:90, functions:95, branches:70 (same as pre-Phase 62 commands.js); context/index.ts: lines:87, functions:83, branches:77 (same as context.js); evolve/index.ts: lines:85, functions:94, branches:70 (same as evolve.ts)
- **Failure means:** A threshold was lowered to pass tests — this is prohibited; restore the original value and fix the underlying coverage gap instead

### S20: Total sub-module line count within 15% of original 8,081 lines
- **What:** The sum of all lines across lib/commands/*.ts, lib/context/*.ts, lib/evolve/*.ts does not exceed 9,293 lines (8,081 * 1.15), guarding against decomposition bloat
- **Command:** `wc -l /Users/neo/Developer/Projects/GetResearchDone/lib/commands/*.ts /Users/neo/Developer/Projects/GetResearchDone/lib/context/*.ts /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/*.ts | tail -1`
- **Expected:** Total lines <= 9,293 (the 15% bloat budget for TypeScript type annotation overhead, import boilerplate, and JSDoc headers)
- **Failure means:** The decomposition introduced excessive boilerplate; review the largest sub-modules for redundant type definitions or duplicated import blocks

**Sanity gate:** ALL 20 sanity checks must pass. Wave-level blocking: S1–S13 must pass before Wave 2 begins. S14–S17 must pass before Wave 3 begins. S18–S20 must pass before Phase 62 is marked complete. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of decomposition correctness via existing test suites and regression gate.
**IMPORTANT:** These proxy metrics are strong — the pre-existing test suites directly exercise the same exported function contracts being decomposed. Tests run via the CJS proxy chain (module.js -> module/index.ts -> sub-modules), validating the full re-export stack. However, they remain proxy metrics because they run under ts-jest, not plain Node.js — runtime CJS interop under production invocation is deferred to Phase 65.

---

### P1: lib/evolve — unit test pass + coverage thresholds
- **What:** All 170 tests in tests/unit/evolve.test.js pass against the decomposed lib/evolve/ barrel, meeting pre-existing coverage thresholds
- **How:** Run evolve unit tests with coverage collection against the barrel entry point
- **Command:** `npx jest tests/unit/evolve.test.js --coverage --coverageReporters=text 2>&1 | tail -30`
- **Target:** All 170 tests pass (exit 0); coverage meets `lines: 85, functions: 94, branches: 70` for lib/evolve/index.ts (same thresholds as pre-Phase 62 evolve.ts)
- **Evidence:** evolve.test.js tests all 39 exported functions including createWorkItem, readEvolveState, writeEvolveState, scoreWorkItem, selectPriorityGroups, runEvolve, cmdEvolve, and the full set of constants. The decomposition is purely structural (no logic changes) — any extraction error causing a function to be placed in the wrong sub-module or incorrectly imported would surface as a test failure.
- **Correlation with full metric:** HIGH — test suite directly exercises all 39 exports at pre-existing production gates; the CJS proxy chain (evolve.js -> evolve/index.ts -> sub-modules) is the same path used in production
- **Blind spots:** ts-jest compilation, not runtime Node.js require() — see DEFER-62-01; async orchestration calls are mocked in tests
- **Validated:** No — awaiting deferred validation at Phase 65

### P2: lib/commands — unit test pass + coverage thresholds
- **What:** All 231 tests in tests/unit/commands.test.js pass against the decomposed lib/commands/ barrel, meeting pre-existing coverage thresholds
- **How:** Run commands unit tests with coverage collection against the barrel entry point
- **Command:** `npx jest tests/unit/commands.test.js --coverage --coverageReporters=text 2>&1 | tail -30`
- **Target:** All 231 tests pass (exit 0); coverage meets `lines: 90, functions: 95, branches: 70` for lib/commands/index.ts (same thresholds as pre-Phase 62 commands.js)
- **Evidence:** commands.test.js (4,088 lines) tests all 32 exported symbols across slug/timestamp, todos, config, phase-info, progress, long-term-roadmap, quality, dashboard, health, and search command groups. commands.js is the largest test file in the project — any missing barrel re-export or logic error introduced during TypeScript migration of a sub-module would surface immediately. The commands module is the most-exercised in the test suite.
- **Correlation with full metric:** HIGH — 231 tests at pre-existing production gates; dashboard and health tests exercise readCachedRoadmap/readCachedState cross-sub-module imports specifically; any cross-sub-module import regression would fail these tests
- **Blind spots:** ts-jest compilation not plain Node.js — see DEFER-62-01; integration tests that invoke grd-tools.js as a subprocess are a stronger signal than unit tests for consumer resolution (see P5)
- **Validated:** No — awaiting deferred validation at Phase 65

### P3: lib/context — unit test pass + coverage thresholds
- **What:** All 199 tests in tests/unit/context.test.js pass against the decomposed lib/context/ barrel, meeting pre-existing coverage thresholds
- **How:** Run context unit tests with coverage collection against the barrel entry point
- **Command:** `npx jest tests/unit/context.test.js --coverage --coverageReporters=text 2>&1 | tail -30`
- **Target:** All 199 tests pass (exit 0); coverage meets `lines: 87, functions: 83, branches: 77` for lib/context/index.ts (same thresholds as pre-Phase 62 context.js)
- **Evidence:** context.test.js (3,031 lines) tests 46 exported functions including buildInitContext, inferCeremonyLevel, and all 32+ cmdInit* functions. context.js is a god-file of init context builders — any extraction error causing a builder to consume the wrong imports from base.ts would surface as a test failure on the specific builder's assertions. The agents sub-module's thin wrappers (cmdInitExecutor -> cmdInitExecutePhase etc.) are tested via their expected output shapes.
- **Correlation with full metric:** HIGH — test suite directly exercises all 46 exports at pre-existing production gates; the shared base.ts module (inferCeremonyLevel, buildInitContext) is tested transitively through every cmdInit* function that calls it
- **Blind spots:** ts-jest compilation not plain Node.js; MCP and backend detection are mocked in unit tests — see DEFER-62-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P4: Full npm test regression gate (all 2,676+ tests pass)
- **What:** The complete test suite passes with no regressions — not just the 3 decomposed modules but all modules that import from them, including integration tests that invoke grd-tools.js as a subprocess
- **How:** Run the full test suite
- **Command:** `npm test`
- **Target:** All 2,676+ tests pass (exit 0); no coverage threshold regressions for any module; no new failures in integration tests
- **Evidence:** The full regression suite is the critical gate for catching consumer-side breakage. bin/grd-tools.js imports from lib/commands (line 146), lib/context (line 115), and lib/evolve (line 80). lib/mcp-server.js imports from lib/context (line 94), lib/commands (line 124), and lib/evolve (line 44). Any CJS proxy misconfiguration, missing export, or import name collision would surface in the integration tests that invoke grd-tools.js subprocesses.
- **Correlation with full metric:** HIGH — the complete codebase is exercised; this is the highest-confidence proxy available before Phase 65 runtime validation under plain Node.js
- **Blind spots:** Tests run under ts-jest; runtime CJS interop under production node invocation (without ts-jest) remains DEFER-62-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P5: CJS proxy modules loadable with correct export counts
- **What:** All three decomposed modules can be required via Node.js and the exported symbol counts match or exceed pre-Phase 62 baselines
- **How:** Require each barrel via its CJS proxy and count exports
- **Command:** `node -e "const defs = [['commands',32],['context',46],['evolve',39]]; defs.forEach(([m,e]) => { const mod = require('/Users/neo/Developer/Projects/GetResearchDone/lib/' + m); const k = Object.keys(mod).length; console.log(m + ': ' + k + ' exports (expected ' + e + ') ' + (k >= e ? 'OK' : 'FAIL')); });" 2>&1`
- **Target:** commands: >= 32, context: >= 46, evolve: >= 39 (matches current verified export counts)
- **Evidence:** Export count is a direct proxy for barrel completeness. A missing re-export line in index.ts causes a symbol to be undefined for callers — this is the primary silent failure mode for barrel decomposition. The count check catches missing exports that might not be exercised by the specific test suite but are consumed by grd-tools.js or mcp-server.js in production.
- **Correlation with full metric:** HIGH for barrel completeness; does not validate type correctness (tsc --noEmit catches that instead)
- **Blind spots:** Export count does not catch wrong-symbol re-exports (e.g., if two symbols swap names, count stays the same but callers break); the unit test suites catch this
- **Validated:** No — awaiting deferred validation at Phase 65

### P6: Zero any types across all decomposed sub-modules
- **What:** The complete decomposed surface (lib/commands/*.ts, lib/context/*.ts, lib/evolve/*.ts) has zero any types in type annotation positions — the strict no-any constraint is fully met
- **How:** Grep for any type annotations across all sub-modules
- **Command:** `grep -rn ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/commands/ /Users/neo/Developer/Projects/GetResearchDone/lib/context/ /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/`
- **Target:** No output (zero matches)
- **Evidence:** The no-any constraint is the core type safety requirement of v0.3.0 (REQ-71 through REQ-74). Decomposition + TypeScript migration combined must not introduce any escapes that were not present in the Phase 61 evolve.ts migration. This check is redundant with tsc --noEmit in some respects but catches escape hatches that TypeScript allows (e.g., explicit any cast) that tsc does not reject.
- **Correlation with full metric:** HIGH — directly measures the no-any constraint at module export boundaries
- **Blind spots:** Does not catch any in type alias positions (rare) or in generic constraints (e.g., Record<string, any> — grep for this separately if suspicious)
- **Validated:** No — awaiting deferred validation at Phase 65

### P7: npm run lint passes on all decomposed sub-modules
- **What:** ESLint with @typescript-eslint processes all lib/commands/*.ts, lib/context/*.ts, lib/evolve/*.ts files without errors
- **How:** Run linter across the project
- **Command:** `npm run lint 2>&1 | grep -E 'lib/commands|lib/context|lib/evolve'`
- **Target:** No output (zero errors for decomposed sub-modules)
- **Evidence:** @typescript-eslint catches annotation quality issues beyond what tsc validates: unused imports (common during extraction when an import is pulled in but a function using it lands in a different sub-module), no-require-imports workaround omissions, and missing _ prefixes on unused parameters. lint has blocked commits in prior phases (58-02 established the dual rule pattern) and is run by the pre-commit hook.
- **Correlation with full metric:** MEDIUM — lint validates code quality conventions, not functional correctness; a linting failure indicates a code quality issue in the extraction process
- **Blind spots:** Lint does not execute the code — runtime behavior is tested by unit tests (P1-P4)
- **Validated:** No — awaiting deferred validation at Phase 65

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Barrel re-export backward compatibility under real CLI and MCP invocation — DEFER-62-01
- **What:** All three decomposed modules (commands, context, evolve) work correctly when loaded via plain `node bin/grd-tools.js` and via the MCP server (lib/mcp-server.js) without ts-jest transformation — confirming the CJS proxy -> barrel -> sub-module chain works under production Node.js require() resolution
- **How:** Run a representative set of grd-tools.js CLI commands that exercise each decomposed module in a fresh Node.js process (no ts-jest); verify correct output for commands spanning all three modules
- **Why deferred:** ts-jest transforms .ts imports during tests; the production runtime uses Node.js's native CJS require(). The proxy pattern (`module.exports = require('./commands/index.ts')`) depends on Node.js being able to require .ts files at runtime via ts-node or ts-jest — this is not the default behavior. The same CJS interop concern tracked by DEFER-59-01 applies here.
- **Validates at:** Phase 65 (Integration Validation & Documentation), under REQ-64/REQ-78/REQ-80/REQ-81
- **Depends on:** Phase 65 runtime resolution strategy (ts-node, dist/ build, or --experimental-strip-types); DEFER-59-01 must be resolved first
- **Target:** All grd-tools.js commands that exercise commands, context, and evolve functionality execute without runtime module resolution errors; all MCP tools exposed via mcp-server.js remain functional
- **Risk if unmet:** Phase 65 would need to implement a dist/ build step or ts-node wrapper; budget 1-2 additional plans in Phase 65; the barrel decomposition pattern itself is sound (validated by test suite) but production delivery requires runtime resolution
- **Fallback:** Add ts-node as a production dependency and adjust the grd-tools.js entry point shebang; or build a dist/ compilation step that resolves .ts imports before production deployment

### D2: Integration test subprocess coverage for all command groups — DEFER-62-02
- **What:** Integration tests in tests/integration/ that invoke bin/grd-tools.js as a real subprocess exercise all 10 commands sub-modules (not just the ones covered by unit tests), confirming the CJS proxy -> barrel -> sub-module chain works end-to-end under ts-jest transformation
- **How:** Run the full integration test suite and verify that commands spanning dashboard, health, search, long-term-roadmap, and config command groups are exercised by at least one integration test each
- **Why deferred:** The integration tests do exercise grd-tools.js as a subprocess (under ts-jest) but the current integration test coverage may not span all 10 command sub-modules introduced by the decomposition. This is a coverage gap in the test suite, not a code defect — but it means some sub-module paths are only exercised by unit tests (which mock all I/O) and not by subprocess integration tests.
- **Validates at:** Phase 64 (Test Suite Migration), when integration tests may be augmented as part of the TypeScript test migration; or Phase 65 integration validation
- **Depends on:** Phase 64 test suite analysis and any integration test gaps identified there
- **Target:** All 10 commands sub-modules, all 6 context sub-modules, and all 7 evolve sub-modules have at least one integration test path through the CJS proxy chain
- **Risk if unmet:** A barrel re-export bug affecting only a specific sub-module might not be caught until a user invokes the corresponding grd-tools.js command in production; risk is LOW given the comprehensive unit test suites
- **Fallback:** Add targeted integration tests for uncovered command groups in Phase 64 or Phase 65

## Ablation Plan

**No ablation plan** — This phase implements a pure structural decomposition (no algorithmic changes). Each sub-module is extracted from a monolithic source with no modifications to logic. The sub-module boundaries are defined by functional cohesion (types, state, discovery, scoring, orchestrator, cli for evolve; slug-timestamp, todo, config, phase-info, progress, long-term-roadmap, quality, dashboard, health, search for commands; base, execute, project, research, agents, progress for context).

The closest equivalent to ablation is the wave-by-wave tsc check: each wave's sanity checks (S2, S8/S11, S16) measure whether the cumulative decomposition compiles at that dependency boundary. If Wave 2 fails tsc but Wave 1 passed, this isolates the defect to Wave 2's sub-modules or their cross-sub-module imports.

For the cross-sub-module dependency within commands/ (dashboard.ts and health.ts consuming readCachedRoadmap and readCachedState from phase-info.ts), the commands unit tests (P2) provide the ablation signal: if the cross-sub-module import is broken, the dashboard and health tests fail while slug-timestamp and todo tests still pass — isolating the defect to the intra-commands/ import chain.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 62 modifies only TypeScript/JavaScript library source files under lib/.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| commands.js coverage | Pre-Phase 62 coverage thresholds | lines: 90, functions: 95, branches: 70 | jest.config.js:17 |
| context.js coverage | Pre-Phase 62 coverage thresholds | lines: 87, functions: 83, branches: 77 | jest.config.js:18 |
| evolve.ts coverage | Pre-Phase 62 coverage thresholds | lines: 85, functions: 94, branches: 70 | jest.config.js:21 |
| commands.js export count | Current runtime exports | 32 symbols | `node -e "require('./lib/commands')"` |
| context.js export count | Current runtime exports | 46 symbols | `node -e "require('./lib/context')"` |
| evolve.ts export count | Current runtime exports | 39 symbols | `node -e "require('./lib/evolve')"` |
| Total test count | Full test suite before Phase 62 | 2,676 tests | STATE.md performance metrics |
| Total monolithic line count | Original 3 files combined | 8,081 lines | `wc -l commands.js context.js evolve.ts` |
| tsc --noEmit status | After Phase 61 completion | Zero errors | Phase 61 complete status |

Coverage thresholds must not decrease. The new barrel entry point thresholds must equal the pre-Phase 62 monolithic file thresholds.

## Evaluation Scripts

**Location of evaluation code:**

All evaluation commands are inline (no separate eval scripts needed). The full evaluation sequence is:

**How to run the full evaluation (after all 5 plans complete):**

```bash
# Step 1: Full compilation check (S16 equivalent)
npx tsc --noEmit

# Step 2: No-any sweep across all sub-modules (P6)
grep -rn ': any\b' \
  /Users/neo/Developer/Projects/GetResearchDone/lib/commands/ \
  /Users/neo/Developer/Projects/GetResearchDone/lib/context/ \
  /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/

# Step 3: Line count audit — no sub-module exceeds 600 lines, total within 15% bloat (S4, S9, S12, S15, S20)
wc -l \
  /Users/neo/Developer/Projects/GetResearchDone/lib/commands/*.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/context/*.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/evolve/*.ts

# Step 4: CJS proxy verification — each is ~17 lines (S6, S10, S14)
wc -l \
  /Users/neo/Developer/Projects/GetResearchDone/lib/commands.js \
  /Users/neo/Developer/Projects/GetResearchDone/lib/context.js \
  /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.js

# Step 5: Lint (P7)
npm run lint

# Step 6: Per-module tests with coverage (P1, P2, P3)
npx jest \
  tests/unit/evolve.test.js \
  tests/unit/commands.test.js \
  tests/unit/context.test.js \
  --coverage --coverageReporters=text

# Step 7: Full regression suite (P4)
npm test

# Step 8: Export count verification (S5, S13, S17, P5)
node -e "
const defs = [['commands', 32], ['context', 46], ['evolve', 39]];
defs.forEach(([m, expected]) => {
  const mod = require('/Users/neo/Developer/Projects/GetResearchDone/lib/' + m);
  const actual = Object.keys(mod).length;
  console.log(m + ': ' + actual + ' exports (expected ' + expected + ') ' + (actual >= expected ? 'OK' : 'FAIL'));
});
"

# Step 9: jest.config.js threshold key check (S18, S19)
grep -E 'commands/index\.ts|context/index\.ts|evolve/index\.ts' \
  /Users/neo/Developer/Projects/GetResearchDone/jest.config.js
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: evolve/ sub-modules exist (7+) | | | |
| S2: tsc on evolve sub-modules | | | |
| S3: No-any evolve sub-modules | | | |
| S4: Line counts evolve (<= 600) | | | |
| S5: evolve barrel exports (>= 39) | | | |
| S6: evolve.js proxy confirmed | | | |
| S7: commands part-1 sub-modules exist (7) | | | |
| S8: tsc on commands part-1 sub-modules | | | |
| S9: Line counts commands part-1 (<= 600) | | | |
| S10: context/ sub-modules + proxy | | | |
| S11: tsc on context sub-modules | | | |
| S12: Line counts context (<= 600) | | | |
| S13: context barrel exports (>= 46) | | | |
| S14: commands part-2 sub-modules + barrel + proxy | | | |
| S15: Line counts commands part-2 (<= 600) | | | |
| S16: tsc --noEmit full Phase 62 | | | |
| S17: commands barrel exports (>= 32) | | | |
| S18: jest.config.js threshold keys | | | |
| S19: No threshold values lowered | | | |
| S20: Total line count within 15% of 8,081 | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: evolve tests | lines:85 fn:94 br:70 | | | |
| P2: commands tests | lines:90 fn:95 br:70 | | | |
| P3: context tests | lines:87 fn:83 br:77 | | | |
| P4: Full npm test suite | 2,676+ tests pass | | | |
| P5: CJS proxy export counts | commands:32 context:46 evolve:39 | | | |
| P6: No-any sweep | Zero matches | | | |
| P7: npm run lint | Zero errors | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-62-01 | Barrel re-export backward compat under real CLI/MCP | PENDING | Phase 65 |
| DEFER-62-02 | Integration test subprocess coverage for all command groups | PENDING | Phase 64/65 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 20 checks organized by wave with specific commands and failure diagnoses. Wave-level blocking (S1–S13 before Wave 2, S14–S17 before Wave 3) prevents downstream waves from building on a broken decomposition. The line count checks (S4, S9, S12, S15, S20) are uniquely specific to Phase 62's decomposition goal and not present in prior phase evals.
- Proxy metrics: Well-evidenced — the pre-existing test suites (231 commands, 199 context, 170 evolve tests) directly exercise the same exported function contracts being decomposed. A pure structural decomposition with no logic changes means any test failure isolates to an extraction error (function placed in wrong sub-module) or a barrel omission (symbol not re-exported). The full regression suite (P4) catches consumer-side breakage in grd-tools.js and mcp-server.js that per-module tests cannot. Confidence is HIGH for functional correctness.
- Deferred coverage: Appropriately scoped — DEFER-62-01 (runtime CJS interop) is the same concern tracked by DEFER-59-01 for all prior migration phases and will be resolved collectively at Phase 65. DEFER-62-02 identifies a test coverage gap that Phase 64 is well-positioned to close. Neither deferred item represents an unknown unknown — they are known limitations of the ts-jest validation approach used throughout v0.3.0.

**What this evaluation CAN tell us:**
- Whether all 21+ sub-modules compile under strict:true with zero any types in exported signatures
- Whether the barrel re-export pattern correctly exposes all 32 + 46 + 39 = 117 symbols from the three original modules
- Whether the wave-by-wave dependency chain (evolve sub-modules, commands part 1, context, commands part 2) produces correct cross-sub-module type contracts
- Whether the decomposition preserves all existing functional behavior (test suites at pre-existing thresholds)
- Whether no sub-module exceeds 600 lines (the core structural decomposition goal)
- Whether the CJS proxy chain (module.js -> module/index.ts -> sub-modules) resolves correctly under ts-jest

**What this evaluation CANNOT tell us:**
- Whether the CJS proxy chain works under plain Node.js without ts-jest transformation (addresses when DEFER-62-01 resolves at Phase 65)
- Whether all 10 commands sub-modules are covered by integration tests invoking grd-tools.js as a real subprocess (addresses when DEFER-62-02 resolves at Phase 64/65)
- Whether the TypeScript type annotations in the new sub-modules correctly describe the runtime behavior for complex edge cases not covered by the existing unit test mocks (inherent limitation of annotation-only migration validation)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-02*
