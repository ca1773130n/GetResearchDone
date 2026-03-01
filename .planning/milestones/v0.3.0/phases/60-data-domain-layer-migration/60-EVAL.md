# Evaluation Plan: Phase 60 — Data & Domain Layer Migration

**Designed:** 2026-03-02
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** JS-to-TS migration — 11 modules: frontmatter, markdown-split, state, roadmap, cleanup, gates, requirements, deps, verify, scaffold, phase
**Reference papers:** N/A — engineering migration phase, not experimental

## Evaluation Overview

Phase 60 migrates the data-parsing and domain-logic layer (11 modules, 7,280 lines total) from
CommonJS JavaScript to TypeScript under `strict: true`, extending the foundation established by
Phase 59 (paths.ts, backend.ts, utils.ts, types.ts). Unlike Phase 59, which migrated three modules
with minimal cross-dependencies, Phase 60 involves a multi-wave dependency chain: frontmatter.ts and
markdown-split.ts must exist before verify.ts and scaffold.ts can import them (Wave 2), and
frontmatter.ts + cleanup.ts + gates.ts must exist before phase.ts can import them (Wave 3). This
introduces cross-plan compilation dependencies as a new evaluation concern.

The dominant proxy metric for correctness is the same as Phase 59: the pre-existing unit test suites.
Across the 11 migrated modules, the current jest.config.js tracks per-file coverage thresholds for 10
of the 11 (requirements.js may lack an explicit per-file entry — confirmed by inspection of
jest.config.js). All tests are authored in JavaScript against the .js sources; since the migration is
purely additive (type annotations only, no logic changes), passing the existing tests at their
pre-existing thresholds is a strong indicator that the migration is correct.

One evaluation concern is unique to Phase 60: cross-module typed imports. Phase 59 modules depended
only on the foundation (Node built-ins, no lib/ imports). Phase 60 modules import from each other and
from the Phase 59 foundation — so tsc --noEmit serves double duty: it validates type annotations
within each module AND validates that the inter-module type contracts are satisfied. A failure in tsc
after Wave 1 is informative: it may indicate a missing or incorrect interface in types.ts that
needs updating before Wave 2 can proceed.

The deferred validation scope for Phase 60 is identical to Phase 59: runtime CommonJS interop under
plain `node bin/grd-tools.js` is not tested in-phase and remains DEFER-59-01 (already tracked),
deferred to Phase 65.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `tsc --noEmit` zero errors | REQ-66, REQ-67, all five PLAN.md files | Primary indicator of correct TypeScript annotation across all 11 modules and their inter-module type contracts |
| `grep -c ': any'` = 0 | REQ-66/67 success criteria ("zero any types") | Directly measures the no-any constraint; any escape hatch here defeats the type safety goal |
| Explicit return types on all exported cmd* functions | REQ-66/67 success criteria | Enforces type safety at module boundaries — the key benefit of migration |
| `npm run lint` zero errors | All PLAN.md must_haves | @typescript-eslint validates annotation quality and catches common TS-in-CommonJS mistakes |
| Per-module unit test pass + coverage thresholds met | All PLAN.md must_haves | 11 existing test suites directly exercise the same exported function contracts being migrated |
| Full `npm test` pass (2,676+ tests) | All PLAN.md must_haves | Zero regressions across entire codebase including all modules that depend on the 11 migrated sources |
| All 11 .js proxy files exist with correct proxy pattern | PLAN 60-05 must_haves | Confirms CommonJS backward compatibility is preserved for downstream .js consumers (DEFER-59-01) |
| jest.config.js .ts threshold entries for all 11 modules | All PLAN.md must_haves | Confirms per-file coverage gates are transferred to .ts sources for ongoing enforcement |
| Domain-typed structures used (not `string` or `Record<string, unknown>`) | REQ-66, REQ-67 | FrontmatterObject, RoadmapPhase, StateFields, GateCheckResult, Requirement, DependencyGraph used at module boundaries |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 16 | Compilation checks, no-any checks, file existence, proxy pattern verification — one group per wave |
| Proxy (L2) | 13 | Per-module test suites + full regression gate + jest.config.js structural check |
| Deferred (L3) | 2 | Runtime CommonJS interop; downstream Phase 61-64 type resolution |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

Sanity checks are organized by wave. Wave-level checks must pass before proceeding to the next wave.

---

### Wave 1 — Plans 60-01, 60-02, 60-03: frontmatter, markdown-split, state, roadmap, cleanup, gates, requirements

### S1: tsc --noEmit passes after Wave 1 migrations
- **What:** TypeScript compiler accepts all 7 new Wave 1 .ts files — frontmatter.ts, markdown-split.ts, state.ts, roadmap.ts, cleanup.ts, gates.ts, requirements.ts — plus the existing Phase 59 foundation (.types.ts, paths.ts, backend.ts, utils.ts) without errors under strict mode
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostic lines on stdout/stderr
- **Failure means:** One or more Wave 1 modules have annotation errors or inter-module type mismatches (e.g., types.ts interface shapes don't match usage in state.ts or roadmap.ts); inspect tsc output to identify which file and fix before proceeding to Wave 2

### S2: Zero `any` types across all 7 Wave 1 .ts files
- **What:** None of the 7 newly migrated Wave 1 files uses `any` as a type annotation or escape hatch
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/markdown-split.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/cleanup.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts`
- **Expected:** No output (zero matches in type annotation positions)
- **Failure means:** An `any` type was introduced as an escape hatch; locate and replace with `Record<string, unknown>`, `unknown`, or a specific interface from types.ts per the established Phase 59 pattern

### S3: All 7 Wave 1 .js proxy files exist with correct proxy pattern
- **What:** Each .js file is a thin CommonJS proxy re-exporting from its .ts counterpart (not the original implementation)
- **Command:** `for f in frontmatter markdown-split state roadmap cleanup gates requirements; do node -e "const c = require('fs').readFileSync('/Users/neo/Developer/Projects/GetResearchDone/lib/' + '$f' + '.js', 'utf8'); process.stdout.write('$f.js proxy: ' + (c.includes('require(./' + '$f' + '.ts') || c.includes(\"require('./$f.ts'\")) ? 'OK' : 'FAIL: not a proxy') + '\n')"; done`
- **Expected:** All 7 lines show `OK`
- **Failure means:** One or more .js files still contain the original implementation instead of the proxy pattern; rewrite to the proxy pattern

### S4: FrontmatterObject, StateFields, RoadmapPhase domain types used in exports
- **What:** The key domain types from types.ts appear in the exported function signatures of the modules that are supposed to use them
- **Command:** `grep -n 'FrontmatterObject\|StateFields\|RoadmapPhase\|GateCheckResult\|Requirement\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts`
- **Expected:** Each target module shows at least one occurrence of its expected domain type in a function signature or return type position (not just in a comment)
- **Failure means:** Modules are using plain `string`, `Record<string, unknown>`, or `object` at their exported boundaries instead of named domain types; this is the core value the migration delivers — find the exported function and add the specific type

### S5: npm run lint passes on all Wave 1 .ts files
- **What:** ESLint with @typescript-eslint processes all 7 Wave 1 .ts files without errors
- **Command:** `npm run lint`
- **Expected:** Exit 0, zero errors or warnings on the 7 Wave 1 .ts files
- **Failure means:** @typescript-eslint rule violation; inspect lint output and fix the flagged expression (common patterns: unused imports, missing type annotations on internal helpers, CommonJS require() in positions where import type is expected)

---

### Wave 2 — Plan 60-04: deps, verify, scaffold

### S6: tsc --noEmit passes after Wave 2 migrations
- **What:** deps.ts, verify.ts, scaffold.ts compile cleanly — including their typed imports from Wave 1 outputs (frontmatter.ts for verify.ts and scaffold.ts; roadmap.ts for deps.ts)
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostics; this validates the Wave 1 → Wave 2 type contract boundary (e.g., that verify.ts correctly receives FrontmatterObject from extractFrontmatter)
- **Failure means:** Cross-wave type contract failure; most likely: Wave 1 function return types don't match Wave 2 usage patterns; inspect tsc output for the specific mismatched interface

### S7: Zero `any` types in Wave 2 .ts files
- **What:** None of the 3 Wave 2 files uses `any`
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts /Users/neo/Developer/Projects/GetResearchDone/lib/verify.ts /Users/neo/Developer/Projects/GetResearchDone/lib/scaffold.ts`
- **Expected:** No output
- **Failure means:** An `any` escape introduced in Wave 2; replace with the appropriate typed interface

### S8: All 3 Wave 2 .js proxy files exist with correct proxy pattern
- **What:** deps.js, verify.js, scaffold.js are all thin CommonJS proxies
- **Command:** `for f in deps verify scaffold; do grep -l "require.*\.ts" /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: OK" || echo "$f.js: FAIL"; done`
- **Expected:** All 3 files contain the proxy require statement
- **Failure means:** Migration step for creating the proxy was skipped; create the proxy file

### S9: DependencyGraph interface used in deps.ts exported signatures
- **What:** deps.ts uses DependencyGraph (from types.ts) as the parameter/return type of buildDependencyGraph and computeParallelGroups, not a plain `object` or `Record`
- **Command:** `grep -n 'DependencyGraph' /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts`
- **Expected:** At least 2 occurrences (one in buildDependencyGraph return type, one in computeParallelGroups parameter type)
- **Failure means:** deps.ts is using an untyped structure for the graph; update to use DependencyGraph from types.ts

---

### Wave 3 — Plan 60-05: phase + final validation

### S10: tsc --noEmit passes after phase.ts migration (full Phase 60 compilation)
- **What:** All 11 Phase 60 .ts files plus the 4 Phase 59 foundation .ts files compile cleanly under strict mode — the complete migrated lib/ surface
- **Command:** `npx tsc --noEmit`
- **Expected:** Exit 0, zero diagnostics — this is the full data + domain layer integration check
- **Failure means:** phase.ts annotation errors or broken cross-imports (phase.ts has the most cross-module imports: frontmatter.ts, cleanup.ts, gates.ts, utils.ts, paths.ts); inspect tsc output; common failure points are the typed options objects (PhaseAddOptions, PhaseCompleteOptions) and the handling of QualityViolation[] from cleanup.ts

### S11: Zero `any` types in phase.ts
- **What:** phase.ts (1,665 lines, the largest module in Phase 60) uses no `any` escape hatches
- **Command:** `grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/phase.ts`
- **Expected:** No output (zero matches)
- **Failure means:** An `any` was introduced in the largest and most complex migration; locate and replace; common failure points: fs.readdirSync return type, exec/spawn callback parameters, JSON.parse results

### S12: phase.js is a thin CommonJS proxy
- **What:** The original phase.js has been converted to re-export from phase.ts
- **Command:** `grep 'require.*phase\.ts' /Users/neo/Developer/Projects/GetResearchDone/lib/phase.js`
- **Expected:** Matches the proxy pattern line
- **Failure means:** phase.js still contains the original implementation; convert to proxy

### S13: All 11 Phase 60 .ts files exist on disk
- **What:** All 11 modules are present as .ts files after all 5 plans execute
- **Command:** `for f in frontmatter markdown-split state roadmap cleanup gates requirements deps verify scaffold phase; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done`
- **Expected:** All 11 lines show `OK`
- **Failure means:** One or more migrations were skipped or not committed; re-run the corresponding plan

### S14: All 11 Phase 60 .js proxy files exist on disk
- **What:** All 11 .js files are present as proxy files (not deleted, not still containing the original implementation)
- **Command:** `for f in frontmatter markdown-split state roadmap cleanup gates requirements deps verify scaffold phase; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: OK" || echo "$f.js: MISSING"; done`
- **Expected:** All 11 lines show `OK`
- **Failure means:** A .js file was deleted (breaking runtime require() before Phase 65 resolves DEFER-59-01); restore from git and apply proxy pattern

### S15: jest.config.js has .ts threshold entries for all 11 migrated modules
- **What:** The per-file coverage thresholds in jest.config.js reference .ts source files for all 11 Phase 60 modules
- **Command:** `grep -E '\./lib/(frontmatter|markdown-split|state|roadmap|cleanup|gates|requirements|deps|verify|scaffold|phase)\.(ts|js)' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js`
- **Expected:** 11 lines, all showing `.ts` extensions (not `.js`); thresholds must be equal to or greater than the pre-migration values
- **Failure means:** One or more jest.config.js entries still reference `.js` files that no longer contain the implementation (thresholds would be collected against the proxy wrapper, not the migrated source); update to the `.ts` equivalents

### S16: Zero `any` types across all 11 Phase 60 .ts files (final sweep)
- **What:** The complete data and domain layer has zero `any` types in type annotation positions — the strict no-any constraint is fully met across all 11 modules
- **Command:** `grep -rn ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/markdown-split.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/cleanup.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts /Users/neo/Developer/Projects/GetResearchDone/lib/verify.ts /Users/neo/Developer/Projects/GetResearchDone/lib/scaffold.ts /Users/neo/Developer/Projects/GetResearchDone/lib/phase.ts`
- **Expected:** No output (zero matches)
- **Failure means:** One or more escape hatches remain; the final plan (60-05) requires this to be clean; locate and fix before marking Phase 60 complete

**Sanity gate:** ALL 16 sanity checks must pass. Wave-level blocking: S1–S5 must pass before Wave 2 begins. S6–S9 must pass before Wave 3 begins. S10–S16 must pass before Phase 60 is marked complete. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of migration correctness via existing test suites.
**IMPORTANT:** These proxy metrics are strong — the pre-existing test suites directly test the same
exported function contracts being migrated. However, they remain proxy because they run under ts-jest
(not plain Node.js), meaning they do not validate runtime CommonJS interop (deferred to Phase 65 via
DEFER-59-01).

---

### P1: lib/frontmatter.ts — unit test pass + coverage thresholds
- **What:** All tests in frontmatter.test.js pass against the migrated lib/frontmatter.ts source, meeting the pre-existing coverage thresholds
- **How:** Run frontmatter unit tests with coverage collection
- **Command:** `npx jest tests/unit/frontmatter.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 89, functions: 100, branches: 78` for lib/frontmatter.ts
- **Evidence:** frontmatter.test.js tests all 10 exported functions (extractFrontmatter, reconstructFrontmatter, spliceFrontmatter, parseMustHavesBlock, cmdFrontmatterGet/Set/Merge/Validate, getPhaseRoadmapMetadata, FRONTMATTER_SCHEMAS). The test suite was written against lib/frontmatter.js which exports identical functions with identical logic. Any annotation change that alters function behavior would fail existing assertions.
- **Correlation with full metric:** HIGH — test suite directly exercises all 10 exported functions at pre-existing production gates
- **Blind spots:** ts-jest compilation, not runtime Node.js require() — see DEFER-59-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P2: lib/markdown-split.ts — unit test pass + coverage thresholds
- **What:** All tests in markdown-split.test.js pass against the migrated lib/markdown-split.ts source
- **How:** Run markdown-split unit tests with coverage collection
- **Command:** `npx jest tests/unit/markdown-split.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 95, functions: 100, branches: 90` for lib/markdown-split.ts
- **Evidence:** markdown-split.test.js tests all 8 exported functions (estimateTokens, findSplitBoundaries, splitMarkdown, isIndexFile, reassembleFromIndex, readMarkdownWithPartials, INDEX_MARKER, DEFAULT_TOKEN_THRESHOLD). The SplitResult and SplitMarkdownOptions interfaces added during migration are structural additions; any type-induced behavior change would fail the existing assertions.
- **Correlation with full metric:** HIGH — 8 exports fully covered at pre-existing production gates
- **Blind spots:** Runtime CommonJS interop deferred; DEFER-54-01 (real-world large file splitting) remains pending regardless of migration
- **Validated:** No — awaiting deferred validation at Phase 65

### P3: lib/state.ts — unit test pass + coverage thresholds
- **What:** All tests in state.test.js pass against the migrated lib/state.ts source
- **How:** Run state unit tests with coverage collection
- **Command:** `npx jest tests/unit/state.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 85, functions: 88, branches: 77` for lib/state.ts
- **Evidence:** state.test.js tests all 14 exported cmd* functions and the stateExtractField/stateReplaceField utilities. state.ts is the living memory module — any annotation-induced behavior change in STATE.md field parsing, patching, or snapshot operations would fail the existing assertions immediately. The StateLoadResult and StateSnapshotResult interfaces are structural typing only.
- **Correlation with full metric:** HIGH — 14 exports covered; STATE.md manipulation is fully tested
- **Blind spots:** ts-jest only; runtime interop deferred
- **Validated:** No — awaiting deferred validation at Phase 65

### P4: lib/roadmap.ts — unit test pass + coverage thresholds
- **What:** All tests in roadmap.test.js pass against the migrated lib/roadmap.ts source
- **How:** Run roadmap unit tests with coverage collection
- **Command:** `npx jest tests/unit/roadmap.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 91, functions: 94, branches: 83` for lib/roadmap.ts
- **Evidence:** roadmap.test.js tests all 9 exported functions including the schedule computation and analyzeRoadmap. The AnalyzedRoadmap and PhaseSchedule interfaces are additive typing — the underlying schedule arithmetic and ROADMAP.md parsing logic is unchanged. Any annotation-induced logic change would fail the schedule computation assertions.
- **Correlation with full metric:** HIGH — schedule computation is deterministic; the test suite verifies exact date arithmetic
- **Blind spots:** ts-jest only; runtime interop deferred
- **Validated:** No — awaiting deferred validation at Phase 65

### P5: lib/cleanup.ts — unit test pass + coverage thresholds
- **What:** All tests in cleanup.test.js pass against the migrated lib/cleanup.ts source
- **How:** Run cleanup unit tests with coverage collection
- **Command:** `npx jest tests/unit/cleanup.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 92, functions: 96, branches: 80` for lib/cleanup.ts
- **Evidence:** cleanup.test.js tests all 17 exported functions including runQualityAnalysis and all analyze* functions. The QualityViolation and QualityAnalysisResult interfaces are the most complex structural additions in Phase 60 — cleanup.js uses execFileSync for ESLint subprocess invocation, which requires careful Buffer typing. Any type cast error that changes the subprocess result handling would fail cleanup assertions.
- **Correlation with full metric:** HIGH — 17 exports; subprocess handling covered in tests
- **Blind spots:** ts-jest only; execFileSync Buffer typing is a common source of subtle errors — the tsc --noEmit sanity check (S1) is the complementary check for this
- **Validated:** No — awaiting deferred validation at Phase 65

### P6: lib/gates.ts — unit test pass + coverage thresholds
- **What:** All tests in gates.test.js pass against the migrated lib/gates.ts source
- **How:** Run gates unit tests with coverage collection
- **Command:** `npx jest tests/unit/gates.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 98, functions: 100, branches: 82` for lib/gates.ts
- **Evidence:** gates.test.js has the highest line coverage threshold in the project (98%) — the gate check functions are comprehensively tested. GateCheckResult typing is additive; the gate check logic (orphan detection, roadmap coherence) is unchanged.
- **Correlation with full metric:** HIGH — 98% line coverage leaves minimal blind spots
- **Blind spots:** ts-jest only; GATE_REGISTRY's typed GateDefinition[] structure is verified structurally by tsc but the runtime gate dispatch is tested via runPreflightGates assertions
- **Validated:** No — awaiting deferred validation at Phase 65

### P7: lib/requirements.ts — unit test pass + coverage thresholds
- **What:** All tests in requirements.test.js pass against the migrated lib/requirements.ts source
- **How:** Run requirements unit tests with coverage collection
- **Command:** `npx jest tests/unit/requirements.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); if no per-file threshold exists in jest.config.js for requirements.js, the module achieves at least `lines: 80, functions: 90, branches: 70` (derived from the project median)
- **Evidence:** requirements.test.js tests parseRequirements, parseTraceabilityMatrix, and the cmd* functions. The Requirement interface type matches the exact field structure parsed from REQUIREMENTS.md — any interface shape mismatch would fail the parseRequirements assertions.
- **Correlation with full metric:** HIGH — parseRequirements return type is directly testable via field access assertions
- **Blind spots:** requirements.js may not have a pre-existing per-file threshold in jest.config.js; if so, this proxy metric's threshold target is derived from project median, not a pre-established gate
- **Validated:** No — awaiting deferred validation at Phase 65

### P8: lib/deps.ts — unit test pass + coverage thresholds
- **What:** All tests in deps.test.js pass against the migrated lib/deps.ts source
- **How:** Run deps unit tests with coverage collection
- **Command:** `npx jest tests/unit/deps.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 94, functions: 100, branches: 87` for lib/deps.ts
- **Evidence:** deps.test.js tests the Kahn's algorithm implementation via computeParallelGroups and detectCycle. The DependencyGraph interface shapes the exact structure that buildDependencyGraph produces — any interface mismatch would fail the parallel groups computation assertions (since groups are derived from graph topology).
- **Correlation with full metric:** HIGH — Kahn's algorithm is deterministic; coverage at 94% lines / 100% functions
- **Blind spots:** ts-jest only; Wave 2 dependency on roadmap.ts means deps.ts is implicitly tested in routing context
- **Validated:** No — awaiting deferred validation at Phase 65

### P9: lib/verify.ts — unit test pass + coverage thresholds
- **What:** All tests in verify.test.js pass against the migrated lib/verify.ts source
- **How:** Run verify unit tests with coverage collection
- **Command:** `npx jest tests/unit/verify.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 85, functions: 100, branches: 70` for lib/verify.ts
- **Evidence:** verify.test.js tests all 7 cmd* functions. verify.ts imports from frontmatter.ts (extractFrontmatter, parseMustHavesBlock) — this is the first in-phase test of a cross-wave typed import chain. If FrontmatterObject shapes from frontmatter.ts don't match verify.ts usage, tsc will catch it (S6), but the test suite provides runtime confirmation that the typed data flows correctly through the verification logic.
- **Correlation with full metric:** HIGH — 100% function coverage; verify is the integration canary for the Wave 1 → Wave 2 import chain
- **Blind spots:** ts-jest only; parseMustHavesBlock's MustHavesBlock return type is the most complex structured type in Wave 2
- **Validated:** No — awaiting deferred validation at Phase 65

### P10: lib/scaffold.ts — unit test pass + coverage thresholds
- **What:** All tests in scaffold.test.js pass against the migrated lib/scaffold.ts source
- **How:** Run scaffold unit tests with coverage collection
- **Command:** `npx jest tests/unit/scaffold.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 90, functions: 100, branches: 70` for lib/scaffold.ts
- **Evidence:** scaffold.test.js tests cmdTemplateSelect, cmdTemplateFill, cmdScaffold. scaffold.ts imports reconstructFrontmatter from frontmatter.ts and path functions from paths.ts — both already typed. The ScaffoldOptions interface is the key structural addition.
- **Correlation with full metric:** HIGH — 100% function coverage; template selection logic is well-tested
- **Blind spots:** ts-jest only
- **Validated:** No — awaiting deferred validation at Phase 65

### P11: lib/phase.ts — unit test pass + coverage thresholds
- **What:** All tests in phase.test.js pass against the migrated lib/phase.ts source
- **How:** Run phase unit tests with coverage collection
- **Command:** `npx jest tests/unit/phase.test.js --coverage --coverageReporters=text`
- **Target:** All tests pass (exit 0); coverage meets `lines: 91, functions: 94, branches: 70` for lib/phase.ts
- **Evidence:** phase.test.js tests all 10 exported functions including cmdPhaseAdd, cmdPhaseInsert, cmdPhaseRemove, cmdPhaseComplete, cmdMilestoneComplete, cmdValidateConsistency, cmdVersionBump, cmdPhaseBatchComplete, cmdPhasesList, and atomicWriteFile. phase.ts is the most complex migration (1,665 lines) with the most cross-module imports — it is the final integration test of all prior Wave 1 and Wave 2 migrations working together via typed imports.
- **Correlation with full metric:** HIGH — 94% function coverage; phase lifecycle operations are the most critical functionality in the GRD system
- **Blind spots:** ts-jest only; the typed options objects (PhaseAddOptions, PhaseCompleteOptions, etc.) are verified structurally by tsc but their runtime behavior under the existing tests validates the mapping is semantically correct
- **Validated:** No — awaiting deferred validation at Phase 65

### P12: Full test suite regression gate (2,676+ tests)
- **What:** All 2,676+ tests across the entire project pass after all 11 modules are migrated, with zero regressions in any module that imports from the migrated sources
- **How:** Run full test suite
- **Command:** `npm test`
- **Target:** Exit 0; test count >= 2,676; all per-file coverage thresholds met across all modules in jest.config.js (including the 11 updated .ts entries for Phase 60 modules)
- **Evidence:** Phase 60 modules are imported by context.js (imports state, roadmap, frontmatter), commands.js (imports frontmatter, roadmap, phase, state, deps, verify, scaffold), parallel.js (imports deps), autopilot.js (imports state, phase, gates), evolve.js (imports state). A regression in any migrated module's exports propagates immediately to its dependent module's test suite. The full suite is the only gate that catches cross-module regressions simultaneously.
- **Correlation with full metric:** HIGH — spans the entire import graph of the 11 migrated modules transitively
- **Blind spots:** Tests run via ts-jest module resolution (not plain Node.js require()); runtime interop is DEFER-59-01
- **Validated:** No — awaiting deferred validation at Phase 65

### P13: jest.config.js coverage threshold entries updated from .js to .ts for all 11 modules
- **What:** All 11 per-file coverage thresholds in jest.config.js reference .ts source files after Phase 60 completes, confirming coverage gates enforce quality on the migrated sources
- **How:** Inspect jest.config.js for all 11 updated entries
- **Command:** `grep -E '\./lib/(frontmatter|markdown-split|state|roadmap|cleanup|gates|requirements|deps|verify|scaffold|phase)\.ts' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js | wc -l`
- **Target:** Output is 11 (or 10 if requirements.ts has no pre-existing threshold — in that case a new entry must be added)
- **Evidence:** jest.config.js per-file thresholds gate all future contributions. If .js entries remain after migration, coverage is collected from the thin proxy wrappers (~3 lines each), silently invalidating the coverage gates for the real implementation. This check directly validates the migration accounting is complete.
- **Correlation with full metric:** HIGH — direct structural check; no indirection
- **Blind spots:** Does not verify thresholds are met (P1–P12 cover that); only that entries are updated
- **Validated:** No — structural check; no deferred validation needed for this specific metric

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring runtime integration not available in Phase 60.

### D1: Runtime CommonJS Interop — DEFER-59-01 (extended scope)
- **What:** All modules that `require()` the 11 newly migrated Phase 60 modules — including context.js, commands.js, parallel.js, autopilot.js, evolve.js, mcp-server.js, and bin/grd-tools.js — continue to work correctly when invoked via plain `node bin/grd-tools.js` (not via Jest/ts-jest)
- **How:** Run the full CLI test battery in Phase 65: invoke state load, phase add, roadmap analyze, verify plan-structure, scaffold context, and cleanup commands; verify exit 0 and correct JSON output; confirm that `require('./state')`, `require('./phase')`, etc. in non-Jest Node.js context resolve to the .ts files correctly (or that the build step / ts-node registration handles this)
- **Why deferred:** Jest's ts-jest transform and moduleFileExtensions ordering allow test-time require() to resolve .ts files. Plain Node.js 18+ cannot require .ts files natively — the .js proxy files (e.g., state.js → `require('./state.ts')`) are the bridge, but whether Node.js can require a .ts file from a .js proxy is itself unresolved until Phase 65's runtime strategy is chosen. This is the same deferred scope as DEFER-59-01 and intentionally shares that ID.
- **Validates at:** Phase 65 (Integration Validation & Documentation)
- **Depends on:** Phase 65 determining and implementing the runtime resolution strategy (ts-node/register hook, dist/ pre-compilation, or require hook); all Phase 60–64 migrations completing so the full CLI call graph is available
- **Target:** `node bin/grd-tools.js state load` exits 0 with valid JSON; `node bin/grd-tools.js phase add` works; all 40 CLI commands functional; zero `Cannot find module` errors
- **Risk if unmet:** HIGH — if runtime require() cannot resolve .ts files through the .js proxies, the entire CLI is broken for non-Jest invocations. The .js proxy pattern (`module.exports = require('./state.ts')`) will fail in plain Node.js unless a hook like ts-node/register is active. Fallback: pre-compile all .ts to dist/ via `tsconfig.build.json` (already exists from Phase 58) and update bin/grd-tools.js to require from dist/.
- **Fallback:** Compile-to-dist fallback using tsconfig.build.json; update require() paths in bin/ entry points to reference dist/lib/ until full ts-node runtime resolution is in place

### D2: Phase 61–64 Downstream Type Resolution — DEFER-60-01
- **What:** All 20+ modules that will be migrated in Phases 61–64 (context.js, commands.js, parallel.js, tracker.js, mcp-server.js, autopilot.js, evolve.js, long-term-roadmap.js, worktree.js, and others) correctly receive typed values when they import from the 11 Phase 60 modules (e.g., `import type { GateCheckResult }` from `./gates`, `import type { RoadmapPhase }` from `./roadmap`, `import type { FrontmatterObject }` from `./frontmatter`)
- **How:** Verified implicitly as each subsequent migration phase (61–64) runs `tsc --noEmit` — if Phase 60 interfaces are incomplete or incorrectly shaped, those phases' tsc runs will fail with type mismatch errors referencing Phase 60 .ts files
- **Why deferred:** No downstream module has been migrated to .ts yet. The Phase 60 interface shapes (GateCheckResult, RoadmapPhase, FrontmatterObject, Requirement, DependencyGraph, etc.) are authored against the runtime values in the existing .js files, but whether they perfectly match actual usage in all 20+ consumer modules is only verifiable when those consumers begin their migration
- **Validates at:** Phase 61 (first downstream migration using Phase 60 types) through Phase 64 (final downstream migration)
- **Depends on:** Phase 61 migration beginning; at least one downstream module importing type-annotated values from Phase 60 sources
- **Target:** `tsc --noEmit` exits 0 in Phase 61 with no type mismatch errors referencing Phase 60 .ts interfaces; all 11 Phase 60 interfaces correctly consumed by Phase 61+ modules
- **Risk if unmet:** MEDIUM — if a Phase 60 interface is incomplete or incorrectly shaped for Phase 61+ usage, it requires updating the interface definition in types.ts or the specific .ts module (low-effort fix). Because Phase 60 modules are pure type declarations layered on unchanged runtime logic, interface corrections carry zero regression risk.
- **Fallback:** Extend or correct the relevant interface; because the runtime logic is unchanged, interface updates in .ts files never affect existing test behavior

## Ablation Plan

**No ablation plan applicable** — Phase 60 is a pure migration phase with no sub-components to ablate.
The migration pattern is fixed (annotate existing functions, preserve module.exports, convert .js to
thin proxy), and the 3-wave structure is driven by dependency order, not by algorithmic choices with
performance tradeoffs.

Each plan within Phase 60 is independently verifiable via its own sanity checks (S1–S5 for Wave 1,
S6–S9 for Wave 2, S10–S16 for Wave 3) and proxy metrics (P1–P13). If a specific migration proves
intractable for strict mode (e.g., cleanup.ts's execFileSync pattern is unusually resistant to
`any`-free typing), the fallback is to mark that module with a tracked TODO and an `// @ts-expect-error`
comment with a link to the relevant issue — NOT to introduce `any` types silently.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 60 modifies only
`lib/*.ts` source files, `lib/*.js` proxy files, and `jest.config.js`. No HTML, JSX, TSX, Vue,
Svelte, CSS, or frontend route files are modified.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total test count | Tests passing before Phase 60 begins | 2,676 (must not decrease) | STATE.md performance metrics |
| frontmatter.js thresholds | Pre-existing per-file gate | lines: 89, functions: 100, branches: 78 | jest.config.js |
| markdown-split.js thresholds | Pre-existing per-file gate | lines: 95, functions: 100, branches: 90 | jest.config.js |
| state.js thresholds | Pre-existing per-file gate | lines: 85, functions: 88, branches: 77 | jest.config.js |
| roadmap.js thresholds | Pre-existing per-file gate | lines: 91, functions: 94, branches: 83 | jest.config.js |
| cleanup.js thresholds | Pre-existing per-file gate | lines: 92, functions: 96, branches: 80 | jest.config.js |
| gates.js thresholds | Pre-existing per-file gate | lines: 98, functions: 100, branches: 82 | jest.config.js |
| requirements.js thresholds | Check if per-file gate exists | TBD — check jest.config.js | jest.config.js |
| deps.js thresholds | Pre-existing per-file gate | lines: 94, functions: 100, branches: 87 | jest.config.js |
| verify.js thresholds | Pre-existing per-file gate | lines: 85, functions: 100, branches: 70 | jest.config.js |
| scaffold.js thresholds | Pre-existing per-file gate | lines: 90, functions: 100, branches: 70 | jest.config.js |
| phase.js thresholds | Pre-existing per-file gate | lines: 91, functions: 94, branches: 70 | jest.config.js |
| ESLint clean on all .ts files | @typescript-eslint zero errors | 0 errors | Phase 59 established baseline |
| tsc --noEmit exit code | Compiler clean after Phase 59 | Exit 0 (foundation layer compiles) | Phase 59 sanity check S9 |

## Evaluation Scripts

**Location of evaluation code:** No dedicated evaluation scripts required. All checks use existing npm
scripts and npx invocations. The commands in each sanity check and proxy metric are self-contained.

**How to run all Wave 1 sanity checks:**
```bash
# After Plans 60-01, 60-02, 60-03 complete
npx tsc --noEmit
grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/markdown-split.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/cleanup.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts
grep -n 'FrontmatterObject\|StateFields\|RoadmapPhase\|GateCheckResult\|Requirement\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts
npm run lint
```

**How to run all Wave 2 sanity checks:**
```bash
# After Plan 60-04 completes
npx tsc --noEmit
grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts /Users/neo/Developer/Projects/GetResearchDone/lib/verify.ts /Users/neo/Developer/Projects/GetResearchDone/lib/scaffold.ts
grep -n 'DependencyGraph' /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts
```

**How to run all Wave 3 sanity checks (final validation):**
```bash
# After Plan 60-05 completes
npx tsc --noEmit
grep -n ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/phase.ts
for f in frontmatter markdown-split state roadmap cleanup gates requirements deps verify scaffold phase; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.ts && echo "$f.ts: OK" || echo "$f.ts: MISSING"; done
for f in frontmatter markdown-split state roadmap cleanup gates requirements deps verify scaffold phase; do test -f /Users/neo/Developer/Projects/GetResearchDone/lib/$f.js && echo "$f.js: OK" || echo "$f.js: MISSING"; done
grep -E '\./lib/(frontmatter|markdown-split|state|roadmap|cleanup|gates|requirements|deps|verify|scaffold|phase)\.ts' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js | wc -l
grep -rn ': any\b' /Users/neo/Developer/Projects/GetResearchDone/lib/frontmatter.ts /Users/neo/Developer/Projects/GetResearchDone/lib/markdown-split.ts /Users/neo/Developer/Projects/GetResearchDone/lib/state.ts /Users/neo/Developer/Projects/GetResearchDone/lib/roadmap.ts /Users/neo/Developer/Projects/GetResearchDone/lib/cleanup.ts /Users/neo/Developer/Projects/GetResearchDone/lib/gates.ts /Users/neo/Developer/Projects/GetResearchDone/lib/requirements.ts /Users/neo/Developer/Projects/GetResearchDone/lib/deps.ts /Users/neo/Developer/Projects/GetResearchDone/lib/verify.ts /Users/neo/Developer/Projects/GetResearchDone/lib/scaffold.ts /Users/neo/Developer/Projects/GetResearchDone/lib/phase.ts
```

**How to run all proxy metrics:**
```bash
npx jest tests/unit/frontmatter.test.js --coverage --coverageReporters=text
npx jest tests/unit/markdown-split.test.js --coverage --coverageReporters=text
npx jest tests/unit/state.test.js --coverage --coverageReporters=text
npx jest tests/unit/roadmap.test.js --coverage --coverageReporters=text
npx jest tests/unit/cleanup.test.js --coverage --coverageReporters=text
npx jest tests/unit/gates.test.js --coverage --coverageReporters=text
npx jest tests/unit/requirements.test.js --coverage --coverageReporters=text
npx jest tests/unit/deps.test.js --coverage --coverageReporters=text
npx jest tests/unit/verify.test.js --coverage --coverageReporters=text
npx jest tests/unit/scaffold.test.js --coverage --coverageReporters=text
npx jest tests/unit/phase.test.js --coverage --coverageReporters=text
npm test
grep -E '\./lib/(frontmatter|markdown-split|state|roadmap|cleanup|gates|requirements|deps|verify|scaffold|phase)\.ts' /Users/neo/Developer/Projects/GetResearchDone/jest.config.js | wc -l
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc --noEmit (Wave 1, 7 modules) | | | |
| S2: zero any in Wave 1 .ts files | | | |
| S3: all 7 Wave 1 .js proxy files exist | | | |
| S4: domain types used in exports | | | |
| S5: npm run lint (Wave 1) | | | |
| S6: tsc --noEmit (Wave 2, 3 modules) | | | |
| S7: zero any in Wave 2 .ts files | | | |
| S8: all 3 Wave 2 .js proxy files exist | | | |
| S9: DependencyGraph used in deps.ts | | | |
| S10: tsc --noEmit (Wave 3 + full Phase 60) | | | |
| S11: zero any in phase.ts | | | |
| S12: phase.js is thin proxy | | | |
| S13: all 11 Phase 60 .ts files exist | | | |
| S14: all 11 Phase 60 .js proxy files exist | | | |
| S15: jest.config.js has 11 .ts threshold entries | | | |
| S16: zero any across all 11 Phase 60 .ts files | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: frontmatter.test.js lines | 89% | | | |
| P1: frontmatter.test.js functions | 100% | | | |
| P1: frontmatter.test.js branches | 78% | | | |
| P2: markdown-split.test.js lines | 95% | | | |
| P2: markdown-split.test.js functions | 100% | | | |
| P2: markdown-split.test.js branches | 90% | | | |
| P3: state.test.js lines | 85% | | | |
| P3: state.test.js functions | 88% | | | |
| P3: state.test.js branches | 77% | | | |
| P4: roadmap.test.js lines | 91% | | | |
| P4: roadmap.test.js functions | 94% | | | |
| P4: roadmap.test.js branches | 83% | | | |
| P5: cleanup.test.js lines | 92% | | | |
| P5: cleanup.test.js functions | 96% | | | |
| P5: cleanup.test.js branches | 80% | | | |
| P6: gates.test.js lines | 98% | | | |
| P6: gates.test.js functions | 100% | | | |
| P6: gates.test.js branches | 82% | | | |
| P7: requirements.test.js lines | 80% (or existing threshold) | | | |
| P7: requirements.test.js functions | 90% (or existing threshold) | | | |
| P7: requirements.test.js branches | 70% (or existing threshold) | | | |
| P8: deps.test.js lines | 94% | | | |
| P8: deps.test.js functions | 100% | | | |
| P8: deps.test.js branches | 87% | | | |
| P9: verify.test.js lines | 85% | | | |
| P9: verify.test.js functions | 100% | | | |
| P9: verify.test.js branches | 70% | | | |
| P10: scaffold.test.js lines | 90% | | | |
| P10: scaffold.test.js functions | 100% | | | |
| P10: scaffold.test.js branches | 70% | | | |
| P11: phase.test.js lines | 91% | | | |
| P11: phase.test.js functions | 94% | | | |
| P11: phase.test.js branches | 70% | | | |
| P12: npm test total count | >= 2,676 | | | |
| P12: npm test exit code | 0 | | | |
| P13: jest.config.js .ts entry count | 11 | | | |

### Ablation Results

None — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-59-01 | Runtime CommonJS interop — plain node invocation with all 11 Phase 60 .ts sources via .js proxies | PENDING | Phase 65 |
| DEFER-60-01 | Phase 61–64 downstream type resolution — Phase 60 interfaces correctly consumed by subsequent .ts migrations | PENDING | Phase 61 (first downstream .ts migration) |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate and complete. All 16 sanity checks are deterministic with binary outcomes. The
  wave-level gating structure (S1–S5 before Wave 2, S6–S9 before Wave 3) prevents compounding errors
  across the dependency chain. The domain type usage checks (S4, S9) go beyond mere compilation to
  confirm that the semantic goal of the migration — using named types at module boundaries — is
  actually achieved, not just that the code compiles. The final sweep (S16) confirms no `any` types
  leaked across the entire 11-module surface before Phase 60 is declared complete.
- Proxy metrics: Well-evidenced. Eleven per-module test suites (P1–P11) directly test the same
  exported function contracts being migrated, at the same pre-existing production-grade coverage
  thresholds. Correlation with "migration is correct" is HIGH for all 11 per-module metrics. The full
  suite gate (P12) adds cross-module integration coverage across the transitive import graph. The
  jest.config.js structural check (P13) ensures coverage gates remain valid after migration.
- Deferred coverage: Honest and complete. The two deferred items accurately capture the only questions
  that cannot be answered in Phase 60. DEFER-59-01 is the same runtime interop question tracked since
  Phase 59 — its scope is extended to cover the 11 Phase 60 modules but the validation site is
  unchanged (Phase 65). DEFER-60-01 is the new Phase 60-specific deferred: whether the 11 interface
  shapes defined here correctly match Phase 61–64 consumer expectations — verifiable only when those
  phases begin migration.

**What this evaluation CAN tell us:**
- Whether all 11 Phase 60 .ts files compile without errors under strict mode, including cross-wave imports (Wave 1 outputs used by Wave 2 and Wave 3)
- Whether all 11 modules have zero `any` types in their exported function signatures and return types
- Whether the 11 domain-specific interfaces (FrontmatterObject, StateFields, RoadmapPhase, GateCheckResult, Requirement, DependencyGraph, GateDefinition, PhaseAddOptions, QualityViolation, VerifySummaryResult, etc.) are defined and used at module boundaries, not just in comments
- Whether the existing unit tests (cumulative: well over 1,000 lines of tests across the 11 modules) pass at their pre-existing production coverage thresholds after migration
- Whether the full 2,676+ test suite shows zero regressions in any downstream module that imports from the 11 migrated sources
- Whether the CommonJS proxy pattern is correctly applied so that downstream .js consumers continue to receive the correct exports
- Whether jest.config.js coverage gates are correctly transferred to .ts sources for all 11 modules

**What this evaluation CANNOT tell us:**
- Whether `require('./frontmatter')` or any of the 10 other migrated module requires in plain Node.js (not Jest) resolve to the .ts files correctly — deferred to Phase 65 via DEFER-59-01
- Whether the Phase 60 interface shapes precisely match the type expectations of commands.js, context.js, parallel.js, and other Phase 61–64 migration targets — deferred to Phase 61 via DEFER-60-01
- Whether the compiled `dist/` output from `tsconfig.build.json` is behaviorally equivalent to the source .ts files for all 11 modules under real CLI invocations — deferred to Phase 65

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-02*
