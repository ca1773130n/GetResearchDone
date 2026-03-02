# Evaluation Plan: Phase 61 — Integration & Autonomous Layer Migration

**Designed:** 2026-03-02
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** JS-to-TS migration — 6 modules: long-term-roadmap, tracker, worktree, parallel, autopilot, evolve
**Reference papers:** N/A — engineering migration phase, not experimental

## Evaluation Overview

Phase 61 migrates the integration and autonomous execution layer (6 modules, 6,360 lines total) from
CommonJS JavaScript to TypeScript under `strict: true`. This phase extends the foundation of Phase 59
(paths, backend, utils, types) and the data-domain layer of Phase 60 (11 modules including deps.ts
which defines DependencyGraph, and worktree.ts which is depended on by parallel.ts, autopilot.ts, and
evolve.ts). The wave structure is therefore a hard dependency chain: Wave 1 (long-term-roadmap.ts,
tracker.ts, worktree.ts) must complete before Wave 2 (parallel.ts, autopilot.ts) which must complete
before Wave 3 (evolve.ts).

The dominant proxy metric for correctness is identical to Phases 59 and 60: the pre-existing per-module
unit test suites. All tests are authored in JavaScript against the .js sources. Since the migration is
purely additive (type annotations only, no logic changes), passing the existing tests at their
pre-existing coverage thresholds is a strong indicator that migration is correct. Two modules introduce
novel evaluation concerns: tracker.ts types external process interactions (gh CLI via execFileSync), and
autopilot.ts types subprocess spawning (spawnClaude, spawnClaudeAsync). For these, the proxy metric is
the existing unit test suite (which mocks subprocess calls) — real subprocess interaction is deferred.

One critical new concern in Phase 61 is cross-wave typed imports consuming Phase 60 outputs. parallel.ts
imports worktreePath from worktree.ts (Plan 03 output). autopilot.ts imports from deps.ts and gates.ts
(Phase 60 outputs). evolve.ts imports spawnClaudeAsync from autopilot.ts and createEvolveWorktree,
removeEvolveWorktree, pushAndCreatePR from worktree.ts. The `tsc --noEmit` check after each wave
validates these cross-module type contracts in addition to the per-module annotations.

The deferred validation scope for Phase 61 extends DEFER-59-01: runtime CommonJS interop under plain
`node bin/grd-tools.js` remains unvalidated until Phase 65. Additionally, real subprocess execution
(actual gh CLI calls in tracker.ts, actual claude CLI spawning in autopilot.ts) is never exercised by
the in-phase test suite and is explicitly deferred.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `tsc --noEmit` zero errors | REQ-68, REQ-69, all five PLAN.md files | Primary indicator of correct TypeScript annotation across all 6 modules and cross-wave type contracts |
| Zero `any` types in exported function signatures | REQ-68/69 success criteria ("zero any types in exported functions") | Directly measures the no-any constraint at module export boundaries — the core type safety requirement |
| Explicit TypeScript signatures on all exported functions | REQ-68/69 success criteria | Enforces type safety; unchecked module boundaries defeat the migration purpose |
| `npm run lint` zero errors | All PLAN.md must_haves | @typescript-eslint validates annotation quality and catches CommonJS-in-TS mistakes |
| Per-module unit test pass + coverage thresholds | All PLAN.md must_haves | 6 existing test suites directly exercise the same exported function contracts being migrated |
| Full `npm test` pass (1,631+ tests) | Plan 61-05 must_haves | Zero regressions across entire codebase |
| All 6 .js proxy files exist with correct proxy pattern | All PLAN.md must_haves | Confirms CommonJS backward compatibility is preserved for downstream .js consumers (DEFER-59-01) |
| jest.config.js .ts threshold entries for all 6 modules | All PLAN.md must_haves | Confirms per-file coverage gates are transferred to .ts sources |
| External process interfaces typed (gh CLI, claude CLI) | REQ-68, REQ-69 plan success criteria | tracker.ts and autopilot.ts each have subprocess interactions that must be typed — this is unique to Phase 61 vs Phase 60 |
| Evolve state schema interfaces defined | REQ-69, Plan 61-05 success criteria | WorkItem, EvolveState, EvolveGroupState, WorkGroup typed — confirms EVOLVE-STATE.json schema is formalized in TypeScript |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 18 | Compilation, no-any, file existence, proxy pattern, cross-wave type contract checks — organized by wave |
| Proxy (L2) | 7 | Per-module test suites (6 modules) + full regression gate |
| Deferred (L3) | 3 | Runtime CommonJS interop; real subprocess execution; downstream Phase 61-65 type resolution |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

Sanity checks are organized by wave. Wave-level checks must pass before proceeding to the next wave.

---

### Wave 1 — Plans 61-01, 61-02, 61-03: long-term-roadmap, tracker, worktree

### S1: tsc --noEmit passes after Wave 1 migrations
- **What:** TypeScript compiler accepts all 3 new Wave 1 .ts files — long-term-roadmap.ts, tracker.ts, worktree.ts — plus all Phase 59 and Phase 60 foundation .ts files without errors under strict mode
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostic lines on stdout/stderr
- **Failure means:** One or more Wave 1 modules have annotation errors or inter-module type mismatches (e.g., TrackerConfig interface shape doesn't match usage, or WorktreeEntry parsed output doesn't satisfy downstream callers); inspect tsc output to identify which file and fix before proceeding to Wave 2

### S2: Zero `any` types in Wave 1 exported function signatures
- **What:** None of the 3 Wave 1 files uses `any` as a type annotation in exported function parameters or return types; internal helpers may use `unknown` with narrowing but not `any`
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/long-term-roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/tracker.ts /Users/neo/Developer/Projects/GetResearchDone/lib/worktree.ts`
- **Expected:** No output (zero matches in type annotation positions)
- **Failure means:** An `any` type was introduced as an escape hatch; replace with `Record<string, unknown>`, `unknown`, or a named interface per the Phase 59/60 established pattern

### S3: All 3 Wave 1 .ts files exist on disk with minimum line counts
- **What:** long-term-roadmap.ts (min 680 lines), tracker.ts (min 1100 lines), worktree.ts (min 960 lines) exist as full implementations
- **Command:** `for f in long-term-roadmap tracker worktree; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.ts && wc -l < /Users/neo/Developer/Projects/GetResearchDone/lib/$f.ts | awk -v m=0 '{print "/Users/neo/Developer/Projects/GetResearchDone/lib/'"$f"'.ts: " $1 " lines"}' || echo "$f.ts: MISSING"; done`
- **Expected:** All 3 .ts files exist with line counts at or above the minimum specified in PLAN.md
- **Failure means:** Migration was incomplete or the file was not written; re-execute the corresponding plan task

### S4: All 3 Wave 1 .js proxy files exist with correct proxy pattern
- **What:** Each .js file is a thin CommonJS proxy re-exporting from its .ts counterpart (not the original implementation)
- **Command:** `for f in long-term-roadmap tracker worktree; do grep -l "require.*\.ts" /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: PROXY OK" || echo "$f.js: FAIL - not a proxy"; done`
- **Expected:** All 3 files contain the proxy require statement; content is 10-15 lines (not 700+ lines of original implementation)
- **Failure means:** One or more .js files still contain the original implementation; rewrite to the CJS proxy pattern established in Phase 59

### S5: Local interfaces defined in Wave 1 modules (key exports)
- **What:** The 5 local interfaces required by long-term-roadmap.ts (LtMilestone, LongTermRoadmap, ValidationResult, RefinementHistoryEntry, NormalMilestoneEntry), the 13 required by tracker.ts (TrackerConfig, TrackerMapping, GitHubTracker, IssueCreateResult, SyncStats, etc.), and the 8 required by worktree.ts (WorktreeEntry, GrdWorktreeEntry, WorktreeCreateOptions, WorktreeCreateResult, PushPRResult, WorktreeRemoveOptions, MergeOptions, WorktreeParsedName) are present in their respective files
- **Command:** `grep -c 'interface \|type [A-Z]' /Users/neo/Developer/Projects/GetResearchDone/lib/long-term-roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/tracker.ts /Users/neo/Developer/Projects/GetResearchDone/lib/worktree.ts`
- **Expected:** long-term-roadmap.ts: 5+, tracker.ts: 13+, worktree.ts: 8+ interface/type declarations
- **Failure means:** Required interfaces are missing; the module is using inline or `any` types at boundaries that should be named

### S6: npm run lint passes on all Wave 1 .ts files
- **What:** ESLint with @typescript-eslint processes all 3 Wave 1 .ts files without errors
- **Command:** `npm run lint`
- **Expected:** Exit 0, zero errors across all 3 Wave 1 .ts files
- **Failure means:** @typescript-eslint rule violation; inspect lint output and fix the flagged expression (common patterns: unused imports, no-require-imports violations requiring workaround, missing type annotations on internal helpers)

---

### Wave 2 — Plan 61-04: parallel, autopilot

### S7: tsc --noEmit passes after Wave 2 migrations
- **What:** parallel.ts and autopilot.ts compile cleanly — including their typed imports from Wave 1 outputs (worktree.ts for parallel.ts; deps.ts and gates.ts from Phase 60 for autopilot.ts)
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostics; this validates the Wave 1 → Wave 2 type contract boundary (e.g., that worktreePath function signature from worktree.ts is correctly consumed in parallel.ts)
- **Failure means:** Cross-wave type contract failure; most likely: Wave 1 function return types don't match Wave 2 usage patterns, or the require-as cast pattern resolves to an incorrect type shape; inspect tsc output for the specific mismatched interface

### S8: Zero `any` types in Wave 2 exported function signatures
- **What:** Neither parallel.ts nor autopilot.ts uses `any` in exported function signatures
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/parallel.ts /Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts`
- **Expected:** No output (zero matches)
- **Failure means:** An `any` escape introduced in Wave 2; replace with appropriate typed interface (SpawnOptions, SpawnResult, ParallelContext, or PhaseContext as applicable)

### S9: Both Wave 2 .js proxy files exist with correct proxy pattern
- **What:** parallel.js and autopilot.js are thin CommonJS proxies re-exporting from their .ts counterparts
- **Command:** `for f in parallel autopilot; do grep -l "require.*\.ts" /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: PROXY OK" || echo "$f.js: FAIL"; done`
- **Expected:** Both files contain the proxy require statement
- **Failure means:** Migration step for creating the proxy was skipped; create the proxy file following the CJS proxy pattern

### S10: SpawnOptions and SpawnResult interfaces defined in autopilot.ts
- **What:** autopilot.ts defines the subprocess spawning type interfaces that evolve.ts will consume in Wave 3
- **Command:** `grep -n 'interface SpawnOptions\|interface SpawnResult\|interface SpawnConfig\|interface AutopilotOptions\|interface AutopilotResult' /Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts`
- **Expected:** At least 5 interface definitions matching the required Wave 3 contracts (SpawnOptions, SpawnResult, SpawnConfig, AutopilotOptions, AutopilotResult)
- **Failure means:** Key interfaces consumed by evolve.ts are missing; Wave 3 imports will fail at tsc check; define the missing interfaces before Wave 3 begins

### S11: Export counts match plan specifications
- **What:** parallel.ts exports 6 symbols and autopilot.ts exports 16 symbols as specified in Plan 61-04
- **Command:** `node -e "const p = require('/Users/neo/Developer/Projects/GetResearchDone/lib/parallel'); const a = require('/Users/neo/Developer/Projects/GetResearchDone/lib/autopilot'); console.log('parallel exports:', Object.keys(p).length, '/ expected: 6'); console.log('autopilot exports:', Object.keys(a).length, '/ expected: 16');"`
- **Expected:** parallel: 6 exports, autopilot: 16 exports
- **Failure means:** One or more exports were dropped or added during migration; reconcile against the export list in Plan 61-04

---

### Wave 3 — Plan 61-05: evolve + final validation

### S12: tsc --noEmit passes after evolve.ts migration (full Phase 61 compilation)
- **What:** All 6 Phase 61 .ts files plus all Phase 59 and Phase 60 .ts files compile cleanly under strict mode — the complete migrated lib/ surface as of Phase 61
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostics — this is the full integration + autonomous layer integration check
- **Failure means:** evolve.ts annotation errors or broken cross-imports from autopilot.ts or worktree.ts; inspect tsc output; common failure points are the typed promise resolution in spawnClaudeAsync consumption and the union type EvolveGroupState | EvolveState in readEvolveState return

### S13: Zero `any` types in evolve.ts
- **What:** evolve.ts (the largest module in Phase 61 at 2,567 lines) uses no `any` escape hatches
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.ts`
- **Expected:** No output (zero matches)
- **Failure means:** An `any` was introduced in the largest and most complex migration; locate and replace; common failure points: parsed discovery output (use `Record<string, unknown>` with narrowing), fs.readdirSync results, JSON.parse return values

### S14: evolve.js is a thin CommonJS proxy
- **What:** The original evolve.js has been converted to re-export from evolve.ts
- **Command:** `grep 'require.*evolve\.ts' /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.js`
- **Expected:** Matches the proxy pattern line (module.exports = require('./evolve.ts'))
- **Failure means:** evolve.js still contains the original 2,567-line implementation; convert to proxy

### S15: All 6 Phase 61 .ts files exist on disk
- **What:** All 6 modules are present as .ts files after all 5 plans execute
- **Command:** `for f in long-term-roadmap tracker worktree parallel autopilot evolve; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done`
- **Expected:** All 6 lines show `OK`
- **Failure means:** One or more migrations were skipped or not committed; re-run the corresponding plan

### S16: All 6 Phase 61 .js proxy files exist on disk
- **What:** All 6 .js files are present as proxy files (not deleted, not still containing the original implementation)
- **Command:** `for f in long-term-roadmap tracker worktree parallel autopilot evolve; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: OK" || echo "$f.js: MISSING"; done`
- **Expected:** All 6 lines show `OK`
- **Failure means:** A .js file was deleted (breaking runtime require() before Phase 65 resolves DEFER-59-01); restore from git and apply proxy pattern

### S17: jest.config.js has .ts threshold entries for all 6 migrated modules
- **What:** The per-file coverage thresholds in jest.config.js reference .ts source files for all 6 Phase 61 modules
- **Command:** `grep -E '\./lib/(long-term-roadmap|tracker|worktree|parallel|autopilot|evolve)\.(ts|js)' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js`
- **Expected:** 6 lines, all showing `.ts` extensions (not `.js`); thresholds must equal the pre-migration values
- **Failure means:** One or more jest.config.js entries still reference `.js` files that no longer contain the implementation; update to the `.ts` equivalents

### S18: Zero `any` types across all 6 Phase 61 .ts files (final sweep)
- **What:** The complete integration and autonomous layer has zero `any` types in type annotation positions — the strict no-any constraint is fully met across all 6 modules
- **Command:** `grep -rn ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/long-term-roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/tracker.ts /Users/neo/Developer/Projects/GetResearchDone/lib/worktree.ts /Users/neo/Developer/Projects/GetResearchDone/lib/parallel.ts /Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.ts`
- **Expected:** No output (zero matches)
- **Failure means:** One or more escape hatches remain; the final plan (61-05) requires this to be clean; locate and fix before marking Phase 61 complete

**Sanity gate:** ALL 18 sanity checks must pass. Wave-level blocking: S1–S6 must pass before Wave 2 begins. S7–S11 must pass before Wave 3 begins. S12–S18 must pass before Phase 61 is marked complete. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of migration correctness via existing test suites and regression gate.
**IMPORTANT:** These proxy metrics are strong — the pre-existing test suites directly test the same exported function contracts being migrated. However, they remain proxy because they run under ts-jest (not plain Node.js), meaning they do not validate runtime CommonJS interop (deferred to Phase 65 via DEFER-59-01). Subprocess interactions (gh CLI, claude CLI) are mocked in all unit tests — real subprocess execution is deferred.

---

### P1: lib/long-term-roadmap.ts — unit test pass + coverage thresholds
- **What:** All tests in long-term-roadmap.test.js pass against the migrated lib/long-term-roadmap.ts source, meeting pre-existing coverage thresholds
- **How:** Run long-term-roadmap unit tests with coverage collection
- **Command:** `npx jest tests/unit/long-term-roadmap.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 97, functions: 100, branches: 83` for lib/long-term-roadmap.ts
- **Evidence:** long-term-roadmap.test.js tests all 17 exported functions (extractBoldField, parseRefinementHistory, updateRefinementHistory, parseLtMilestone, parseLongTermRoadmap, validateLongTermRoadmap, generateLongTermRoadmap, formatLongTermRoadmap, addLtMilestone, removeLtMilestone, updateLtMilestone, linkNormalMilestone, unlinkNormalMilestone, getLtMilestoneById, initFromRoadmap, and others). Migration is annotation-only; any logic change would fail existing assertions on markdown parsing behaviors.
- **Correlation with full metric:** HIGH — test suite directly exercises all 17 exported functions at pre-existing production gates
- **Blind spots:** ts-jest compilation, not runtime Node.js require() — see DEFER-59-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P2: lib/tracker.ts — unit test pass + coverage thresholds
- **What:** All tests in tracker.test.js pass against the migrated lib/tracker.ts source, meeting pre-existing coverage thresholds
- **How:** Run tracker unit tests with coverage collection
- **Command:** `npx jest tests/unit/tracker.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 85, functions: 89, branches: 70` for lib/tracker.ts
- **Evidence:** tracker.test.js tests all 7 exported symbols (loadTrackerConfig, loadTrackerMapping, saveTrackerMapping, createGitHubTracker, PROVIDERS, createTracker, cmdTracker). The gh CLI interactions are mocked; the test suite validates config loading, mapping persistence, and command routing. Any annotation change that alters parsing logic would fail existing assertions.
- **Correlation with full metric:** HIGH — test suite exercises all 7 exports at pre-existing production gates; gh CLI calls are mocked and thus subprocess typing is not validated (see deferred)
- **Blind spots:** Real gh CLI invocations not tested; runtime CJS interop not tested — see DEFER-59-01 and DEFER-61-02
- **Validated:** No — awaiting deferred validation at Phase 65

### P3: lib/worktree.ts — unit test pass + coverage thresholds
- **What:** All tests in worktree.test.js pass against the migrated lib/worktree.ts source, meeting pre-existing coverage thresholds
- **How:** Run worktree unit tests with coverage collection
- **Command:** `npx jest tests/unit/worktree.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 84, functions: 100, branches: 73` for lib/worktree.ts
- **Evidence:** worktree.test.js tests all 15 exported functions including git porcelain parsing (parsePorcelainWorktrees), worktree lifecycle (createEvolveWorktree, removeEvolveWorktree), and push-PR operations (pushAndCreatePR). Git subprocess calls are mocked. The test suite validates the same logic paths being preserved through migration.
- **Correlation with full metric:** HIGH — test suite exercises all 15 exports at pre-existing production gates; git subprocess interactions are mocked
- **Blind spots:** Real git and gh CLI interactions not tested — see DEFER-61-02
- **Validated:** No — awaiting deferred validation at Phase 65

### P4: lib/parallel.ts + lib/autopilot.ts — unit test pass + coverage thresholds
- **What:** All tests in parallel.test.js and autopilot.test.js pass against the migrated .ts sources, meeting pre-existing coverage thresholds for both modules
- **How:** Run both unit test suites with coverage collection
- **Command:** `npx jest tests/unit/parallel.test.js tests/unit/autopilot.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); parallel.ts meets `lines: 85, functions: 100, branches: 80`; autopilot.ts meets `lines: 93, functions: 93, branches: 80`
- **Evidence:** parallel.test.js tests context building and progress formatting (6 exports). autopilot.test.js tests subprocess spawning (spawnClaude, spawnClaudeAsync), phase resolution (resolvePhaseRange), and wave building (buildWaves). All subprocess calls in autopilot are mocked; the test suite validates orchestration logic, not actual claude CLI invocation.
- **Correlation with full metric:** HIGH for orchestration logic; LOW for actual subprocess behavior (subprocess calls mocked)
- **Blind spots:** Real claude CLI subprocess spawning not tested — see DEFER-61-02; runtime CJS interop not tested — see DEFER-59-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P5: lib/evolve.ts — unit test pass + coverage thresholds
- **What:** All tests in evolve.test.js pass against the migrated lib/evolve.ts source, meeting pre-existing coverage thresholds
- **How:** Run evolve unit tests with coverage collection
- **Command:** `npx jest tests/unit/evolve.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 85, functions: 94, branches: 70` for lib/evolve.ts
- **Evidence:** evolve.test.js tests work item creation (createWorkItem), state I/O (readEvolveState, writeEvolveState), scoring (scoreWorkItem), group selection (selectPriorityGroups), and orchestrator functions (runEvolve, cmdEvolve, cmdEvolveDiscover). The 35+ exports span constants, factory functions, state I/O, and async orchestration — any annotation change that alters logic would fail existing assertions.
- **Correlation with full metric:** HIGH for state management and scoring logic; MEDIUM for async orchestration (subprocess calls mocked)
- **Blind spots:** Real evolve loop with actual subprocess spawning not tested — see DEFER-61-03; real EVOLVE-STATE.json schema evolution not tested
- **Validated:** No — awaiting deferred validation at Phase 65

### P6: Full `npm test` regression gate (all 1,631+ tests pass)
- **What:** The complete test suite passes with no regressions across all modules — not just the 6 migrated modules, but all modules that import from them
- **How:** Run the full test suite
- **Command:** `npm test`
- **Target:** All 1,631+ tests pass (exit 0); no coverage threshold regressions for any module; no new failures in integration tests
- **Evidence:** The full regression suite is the critical gate for catching cross-module breakage. If grd-tools.js or any command imports a migrated module and the proxy pattern is incorrect, the integration tests would catch it. This is the highest-confidence proxy available before Phase 65 runtime validation.
- **Correlation with full metric:** HIGH — the complete codebase is exercised; any proxy misconfiguration, missing export, or type-induced logic error would surface
- **Blind spots:** Tests run under ts-jest (not plain Node.js); runtime CJS interop under production invocation remains DEFER-59-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P7: All 6 CJS proxy modules loadable with correct export counts
- **What:** All 6 migrated modules can be required via Node.js, and the exported symbol counts match plan specifications
- **How:** Require each proxy and count exports
- **Command:** `node -e "const modules = [['long-term-roadmap',17],['tracker',7],['worktree',15],['parallel',6],['autopilot',16],['evolve',35]]; modules.forEach(([m,expected]) => { const mod = require('/Users/neo/Developer/Projects/GetResearchDone/lib/' + m); const actual = Object.keys(mod).length; console.log(m + ': ' + actual + ' exports (expected ' + expected + ') ' + (actual >= expected ? 'OK' : 'FAIL')); });"`
- **Target:** All 6 modules load without error; export counts at or above expected minimums (long-term-roadmap: 17, tracker: 7, worktree: 15, parallel: 6, autopilot: 16, evolve: 35)
- **Evidence:** Export count is a direct proxy for migration completeness — missing exports indicate a function was dropped during migration or not re-exported from the proxy. This has HIGH correlation with migration completeness.
- **Correlation with full metric:** HIGH for migration completeness; does not validate type correctness (only that the runtime shape matches)
- **Blind spots:** A module could load with correct export counts but have incorrect TypeScript annotations — tsc --noEmit catches this instead
- **Validated:** No — awaiting deferred validation at Phase 65

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Runtime CommonJS interop under production CLI invocation — DEFER-61-01
- **What:** All 6 migrated modules work correctly when loaded via plain `node bin/grd-tools.js` without ts-jest transformation — confirming the CommonJS proxy pattern is sufficient for production operation
- **How:** Run grd-tools.js CLI commands that exercise each migrated module in a fresh Node.js process (no ts-jest, no transformation); verify correct output
- **Why deferred:** ts-jest transforms .ts imports during tests; the production runtime uses Node.js's native CJS require() which resolves .js files. The proxy pattern (module.exports = require('./module.ts')) depends on Node.js's ability to require .ts files at runtime. This is experimental and not guaranteed without ts-node or a dist/ build — see DEFER-59-01 which tracks the underlying CommonJS interop concern.
- **Validates at:** Phase 65 (Integration Validation & Documentation), under REQ-64/REQ-78/REQ-80/REQ-81
- **Depends on:** Phase 65 runtime resolution strategy (ts-node, dist/ build, or --experimental-strip-types)
- **Target:** All grd-tools.js commands that exercise tracker, worktree, parallel, autopilot, evolve functionality execute without runtime resolution errors
- **Risk if unmet:** Phase 65 would need to implement a dist/ build step or ts-node wrapper before the v0.3.0 CLI is usable in production; budget 1-2 additional plans in Phase 65
- **Fallback:** Add ts-node as a production dependency and adjust the grd-tools.js entry point shebang

### D2: Real subprocess execution validated (gh CLI, git, claude CLI) — DEFER-61-02
- **What:** The typed subprocess interfaces in tracker.ts (gh CLI via execFileSync), worktree.ts (git via execFileSync), and autopilot.ts (claude CLI via spawn/spawnSync) work correctly when real subprocesses are available — confirming the type signatures match the actual subprocess input/output contracts
- **How:** Run integration tests or manual smoke tests with real gh CLI, git, and claude CLI available in the environment; verify the TypeScript types accurately describe the subprocess call sites
- **Why deferred:** All subprocess calls are mocked in unit tests. The mock contracts (string[], string | null for ghExec; SpawnResult for spawnClaude) are designed from code inspection but not validated against real subprocess behavior. A type mismatch at the subprocess boundary would only surface in a live environment.
- **Validates at:** Phase 65 integration validation, or live smoke testing during v0.3.0 milestone release
- **Depends on:** gh CLI available and authenticated, git repository context, claude CLI available for autopilot smoke test
- **Target:** `grd tracker get-config`, `grd worktree list`, `grd autopilot --dry-run` all execute without type-related runtime errors
- **Risk if unmet:** Typed subprocess interfaces may need correction; since types are annotations only (no runtime effect), this is unlikely to cause actual bugs, but incorrect types would misguide future callers
- **Fallback:** Inspect runtime behavior and correct type annotations in a Phase 65 sub-task

### D3: Full evolve loop with real subprocess spawning produces correct typed state — DEFER-61-03
- **What:** The EvolveState, EvolveGroupState, WorkItem, WorkGroup schemas defined as TypeScript interfaces in evolve.ts match the actual EVOLVE-STATE.json format produced by a live evolve run — confirming the interface definitions are correct, not just internally consistent
- **How:** Run `/grd:evolve` with actual subprocess spawning enabled; inspect the written EVOLVE-STATE.json against the TypeScript interface definitions; verify readEvolveState correctly deserializes the file
- **Why deferred:** Evolve state schema validation requires a live run that spawns real subprocesses, writes real state files, and cycles through iterations. The in-phase unit tests mock subprocess calls and test state I/O against synthetic data. The interface correctness is inferred from code analysis, not from a live EVOLVE-STATE.json round-trip.
- **Validates at:** Phase 65 integration validation, or live evolve run under DEFER-56-01 tracking
- **Depends on:** Live evolve loop execution (claude CLI available, repository in evolvable state)
- **Target:** EVOLVE-STATE.json written by a real evolve run can be deserialized by readEvolveState without TypeScript type errors; all WorkItem fields are present and correctly typed
- **Risk if unmet:** Schema mismatch discovered late could require retroactive interface corrections in evolve.ts; since types are annotations only, this would not break behavior but would invalidate the type safety claim for the state persistence boundary
- **Fallback:** Read an existing EVOLVE-STATE.json from .planning/autopilot/ directory and manually verify schema alignment against the TypeScript interfaces

## Ablation Plan

**No ablation plan** — This phase implements a mechanical migration (annotation addition only, no algorithmic changes) across 6 modules. There are no sub-components with isolatable contributions to assess. The wave ordering is a dependency constraint, not an experimental design — removing any wave simply makes subsequent waves impossible to compile.

The closest equivalent to ablation is the wave-by-wave tsc check: each wave's sanity check (S1, S7, S12) measures whether the cumulative migration compiles at that dependency boundary. If a wave fails tsc but the previous wave passed, this isolates the defect to the current wave.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| long-term-roadmap.js coverage | Pre-migration coverage thresholds | lines: 97, functions: 100, branches: 83 | jest.config.js:23 |
| tracker.js coverage | Pre-migration coverage thresholds | lines: 85, functions: 89, branches: 70 | jest.config.js:32 |
| worktree.js coverage | Pre-migration coverage thresholds | lines: 84, functions: 100, branches: 73 | jest.config.js:35 |
| parallel.js coverage | Pre-migration coverage thresholds | lines: 85, functions: 100, branches: 80 | jest.config.js:26 |
| autopilot.js coverage | Pre-migration coverage thresholds | lines: 93, functions: 93, branches: 80 | jest.config.js:14 |
| evolve.js coverage | Pre-migration coverage thresholds | lines: 85, functions: 94, branches: 70 | jest.config.js:20 |
| Total test count | Full test suite before Phase 61 | 1,631 tests | CLAUDE.md / STATE.md |
| tsc --noEmit status | After Phase 60 completion | Zero errors | Phase 60 complete status |

Coverage thresholds must not decrease. If a migrated .ts file produces lower coverage than the .js baseline, it indicates a test file change (prohibited by all PLAN.md must_haves) or a module boundary change.

## Evaluation Scripts

**Location of evaluation code:**

All evaluation commands are inline (no separate eval scripts needed). The full per-module and aggregate commands are specified in the Proxy Metrics section above.

**How to run the full evaluation (after all 5 plans complete):**

```bash
# Step 1: Compile check (S12 equivalent)
npx tsc --noEmit

# Step 2: No-any sweep (S18)
grep -rn ': any\b' \
  /Users/neo/Developer/Projects/GetResearchDone/lib/long-term-roadmap.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/tracker.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/worktree.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/parallel.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts \
  /Users/neo/Developer/Projects/GetResearchDone/lib/evolve.ts

# Step 3: Lint (S6 / S18 complement)
npm run lint

# Step 4: Per-module tests with coverage (P1-P5)
npx jest \
  tests/unit/long-term-roadmap.test.js \
  tests/unit/tracker.test.js \
  tests/unit/worktree.test.js \
  tests/unit/parallel.test.js \
  tests/unit/autopilot.test.js \
  tests/unit/evolve.test.js \
  --coverage --coverageReporters=text

# Step 5: Full regression suite (P6)
npm test

# Step 6: Export count spot check (P7)
node -e "
const modules = [
  ['long-term-roadmap', 17],
  ['tracker', 7],
  ['worktree', 15],
  ['parallel', 6],
  ['autopilot', 16],
  ['evolve', 35]
];
modules.forEach(([m, expected]) => {
  const mod = require('/Users/neo/Developer/Projects/GetResearchDone/lib/' + m);
  const actual = Object.keys(mod).length;
  console.log(m + ': ' + actual + ' (expected ' + expected + ') ' + (actual >= expected ? 'OK' : 'FAIL'));
});
"

# Step 7: jest.config.js threshold check (S17)
grep -E '\./lib/(long-term-roadmap|tracker|worktree|parallel|autopilot|evolve)\.(ts|js)' \
  /Users/neo/Developer/Projects/GetResearchDone/jest.config.js
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc after Wave 1 | | | |
| S2: No-any Wave 1 | | | |
| S3: Wave 1 .ts files exist | | | |
| S4: Wave 1 .js proxies | | | |
| S5: Wave 1 interface counts | | | |
| S6: lint Wave 1 | | | |
| S7: tsc after Wave 2 | | | |
| S8: No-any Wave 2 | | | |
| S9: Wave 2 .js proxies | | | |
| S10: SpawnOptions/SpawnResult defined | | | |
| S11: Export counts Wave 2 | | | |
| S12: tsc after Wave 3 (full) | | | |
| S13: No-any evolve.ts | | | |
| S14: evolve.js proxy | | | |
| S15: All 6 .ts files exist | | | |
| S16: All 6 .js proxies exist | | | |
| S17: jest.config.js .ts entries | | | |
| S18: No-any final sweep | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: long-term-roadmap.ts tests | lines:97 fn:100 br:83 | | | |
| P2: tracker.ts tests | lines:85 fn:89 br:70 | | | |
| P3: worktree.ts tests | lines:84 fn:100 br:73 | | | |
| P4: parallel.ts + autopilot.ts tests | lines:85/93 fn:100/93 br:80/80 | | | |
| P5: evolve.ts tests | lines:85 fn:94 br:70 | | | |
| P6: Full npm test suite | 1,631+ tests pass | | | |
| P7: CJS proxy export counts | 17+7+15+6+16+35 | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-61-01 | Runtime CommonJS interop (6 migrated modules) | PENDING | Phase 65 |
| DEFER-61-02 | Real subprocess execution (gh CLI, git, claude CLI) | PENDING | Phase 65 / live |
| DEFER-61-03 | Evolve loop EVOLVE-STATE.json schema round-trip | PENDING | Phase 65 / live |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 18 checks organized by wave, each with a specific command and failure diagnosis. Wave-level blocking prevents Wave 2 from starting on a broken Wave 1 baseline. The per-module no-any checks and interface count checks are directly measurable.
- Proxy metrics: Well-evidenced — the pre-existing test suites directly exercise the same exported function contracts being migrated (annotation-only migration means any logic error surfaces as a test failure). The full regression suite (P6) catches cross-module breakage that per-module tests cannot. The export count spot check (P7) catches missing re-exports in proxy files. Confidence is HIGH for functional correctness and MEDIUM for subprocess interaction correctness (mocked in tests).
- Deferred coverage: Comprehensive for the known unknowns — DEFER-61-01 (runtime CJS), DEFER-61-02 (real subprocesses), and DEFER-61-03 (evolve state schema) cover the three dimensions not reachable within the migration-only scope of this phase. All three validate at Phase 65.

**What this evaluation CAN tell us:**
- Whether all 6 modules compile under strict:true with zero any types in exported signatures
- Whether the local interface definitions (20+ interfaces across 6 modules) are internally consistent with how they are used
- Whether the wave-by-wave dependency chain (worktree.ts → parallel.ts → evolve.ts) produces correct type contracts
- Whether the migration preserves all existing functional behavior (test suite at pre-existing thresholds)
- Whether the CJS proxy pattern correctly re-exports all expected symbols

**What this evaluation CANNOT tell us:**
- Whether the CommonJS proxy pattern works under plain Node.js without ts-jest transformation (addresses when DEFER-61-01 resolves at Phase 65)
- Whether the typed subprocess interfaces (TrackerConfig → gh CLI args, SpawnOptions → claude CLI args) accurately describe real subprocess contracts (addresses when DEFER-61-02 resolves at Phase 65 or via live smoke testing)
- Whether the EvolveState / EvolveGroupState TypeScript interfaces correctly describe the actual EVOLVE-STATE.json format produced by a live evolve run (addresses when DEFER-61-03 resolves at Phase 65 or via live run)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-02*
