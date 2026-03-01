# Evaluation Plan: Phase 58 — TypeScript Toolchain & Build Pipeline

**Designed:** 2026-03-02
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** TypeScript toolchain setup — tsc, ts-jest, @typescript-eslint
**Reference papers:** N/A — infrastructure phase, not experimental

## Evaluation Overview

Phase 58 is a pure infrastructure phase: it establishes the TypeScript compilation, linting, and test
pipeline that all subsequent migration phases (59–65) will depend on. There are no research papers and
no experimental results to reproduce. Success is measured entirely by tooling correctness: does the
toolchain compile, lint, and test TypeScript correctly without breaking the existing JavaScript
infrastructure?

Because this phase produces no behavioral change to GRD's functionality — only to its build tooling —
proxy metrics are limited to structural and configurational checks rather than quality metrics. The
primary risk is regression: breaking 2,184 existing JS tests, invalidating the ESLint configuration,
or producing incompatible CommonJS output. All meaningful evaluation is achievable within the phase
itself via sanity checks.

No BENCHMARKS.md exists for this milestone, and none is applicable. Targets are derived directly from
the phase success criteria (ROADMAP.md, REQ-62, REQ-63) and the existing baseline (2,184 passing tests,
eslint clean, per-file coverage thresholds in jest.config.js).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `tsc --noEmit` exit code | REQ-62, Plan 58-01 | Primary indicator of correct tsconfig.json setup |
| `tsc -p tsconfig.build.json` output | REQ-62, Plan 58-01 | Validates CommonJS dist/ output with source maps |
| `npm test` pass rate | REQ-80 (zero regressions), Plan 58-01 | Detects any regression in the 2,184 existing JS tests |
| `npm run lint` exit code | REQ-63, Plan 58-02 | Validates ESLint config loads and lints both .js and .ts |
| `npx jest *.test.ts` pass rate | REQ-62, Plan 58-03 | Validates ts-jest compiles and runs .ts test files |
| Coverage threshold gate | jest.config.js (all 22 per-file entries) | Per-file coverage must not regress after jest.config changes |
| dist/ artifact presence | REQ-62 (source maps, declarations) | Validates build output completeness |
| tsconfig.json strict flag | REQ-78 | Confirms strict mode is enabled as foundation for all future phases |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 12 | All correctness verification achievable in-phase |
| Proxy (L2) | None | No meaningful proxy metrics for infrastructure toolchain setup |
| Deferred (L3) | 1 | Strict mode compatibility with full codebase (only sample file tested in-phase) |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

All sanity checks are organized by plan wave.

---

### Wave 1 — Plan 58-01: TypeScript Compilation

### S1: TypeScript installation verified
- **What:** `tsc` binary is available and is a known working version
- **Command:** `npx tsc --version`
- **Expected:** Prints a version string (e.g., `Version 5.x.x`), exits 0
- **Failure means:** TypeScript was not installed or npm install failed; re-run `npm install --save-dev typescript`

### S2: tsconfig.json strict mode and CommonJS module confirmed
- **What:** tsconfig.json exists with `strict: true` and `module: "commonjs"`
- **Command:** `node -e "const c=JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); console.log('strict:', c.compilerOptions.strict, 'module:', c.compilerOptions.module, 'noEmit:', c.compilerOptions.noEmit)"`
- **Expected:** `strict: true module: commonjs noEmit: true`
- **Failure means:** tsconfig.json missing, malformed, or key settings absent; inspect and correct the file

### S3: tsconfig.build.json extends base and targets dist/
- **What:** tsconfig.build.json exists, extends tsconfig.json, sets `outDir: "./dist"` and `noEmit: false`
- **Command:** `node -e "const c=JSON.parse(require('fs').readFileSync('tsconfig.build.json','utf8')); console.log('extends:', c.extends, 'outDir:', c.compilerOptions.outDir, 'noEmit:', c.compilerOptions.noEmit)"`
- **Expected:** `extends: ./tsconfig.json outDir: ./dist noEmit: false`
- **Failure means:** Build tsconfig not configured; dist/ output will not be produced

### S4: Type-check of sample.ts succeeds with zero errors
- **What:** `tsc --noEmit` on lib/sample.ts exits 0 under strict mode
- **Command:** `npm run build:check`
- **Expected:** Exit 0, no diagnostic output
- **Failure means:** lib/sample.ts has type errors — inspect tsc output and fix the sample file

### S5: Build pipeline produces expected dist/ artifacts
- **What:** `tsc -p tsconfig.build.json` produces .js, .d.ts, .js.map, and .d.ts.map files in dist/lib/
- **Command:** `npm run build && ls dist/lib/sample.js dist/lib/sample.d.ts dist/lib/sample.js.map dist/lib/sample.d.ts.map`
- **Expected:** All four files listed, exit 0
- **Failure means:** Build did not produce full output; check tsconfig.build.json for `declaration`, `declarationMap`, `sourceMap` settings

### S6: build and build:check scripts exist in package.json
- **What:** package.json has both new build scripts
- **Command:** `node -e "const p=require('./package.json'); console.log('build:', p.scripts.build, 'build:check:', p.scripts['build:check'])"`
- **Expected:** `build: tsc -p tsconfig.build.json  build:check: tsc --noEmit`
- **Failure means:** Scripts not added; add them to package.json scripts section

### S7: Existing JS test suite passes with zero regressions
- **What:** All 2,184 pre-existing JS tests pass after tsconfig and package.json changes
- **Command:** `npm test`
- **Expected:** All tests pass, coverage thresholds met, exit 0; no reduction from 2,184 test count
- **Failure means:** A tsconfig or package.json change broke existing tests; review changes and revert or fix

---

### Wave 2 — Plan 58-02: ESLint TypeScript Integration

### S8: ESLint config loads without errors
- **What:** eslint.config.js is syntactically valid and loadable with @typescript-eslint installed
- **Command:** `node -e "const c = require('./eslint.config.js'); console.log('configs:', c.length, 'loaded OK')"`
- **Expected:** `configs: [N] loaded OK` (N >= 3 for the multi-config flat config array)
- **Failure means:** eslint.config.js has a syntax error or requires a missing package; install missing packages

### S9: ESLint lints lib/sample.ts with zero errors
- **What:** @typescript-eslint/parser correctly parses and lints the sample .ts file
- **Command:** `npx eslint lib/sample.ts`
- **Expected:** No output, exit 0
- **Failure means:** ESLint config misconfigured for .ts files or sample.ts violates rules; inspect output and fix config or file

### S10: ESLint reports zero regressions on existing JS files
- **What:** All pre-existing .js files in bin/ and lib/ still lint cleanly
- **Command:** `npm run lint`
- **Expected:** Exit 0, no errors on any .js or .ts file
- **Failure means:** ESLint config change broke existing JS rules; ensure js.configs.recommended still applies and shared rules are preserved

---

### Wave 2 — Plan 58-03: ts-jest Test Infrastructure

### S11: ts-jest runs sample TypeScript test successfully
- **What:** Jest compiles and executes tests/unit/sample.test.ts via ts-jest
- **Command:** `npx jest tests/unit/sample.test.ts --verbose`
- **Expected:** All assertions pass, exit 0; output shows test names from describe/it blocks
- **Failure means:** ts-jest not configured correctly or sample test has failures; inspect jest output for transform errors or assertion failures

### S12: Full test suite passes with .ts test included and coverage thresholds met
- **What:** `npm test` runs all 2,184+ tests (existing .js + new .ts), all pass, all per-file coverage thresholds met
- **Command:** `npm test`
- **Expected:** Exit 0; no reduction from 2,184 test count (new .ts test adds to total); all 22 per-file coverage thresholds in jest.config.js satisfied; coverage output includes `lib/sample.ts`
- **Failure means:** Either (a) ts-jest transform broke existing JS tests — check transform config is .ts-only; (b) sample.test.ts does not achieve lib/sample.ts threshold of lines: 90, functions: 100, branches: 80; (c) collectCoverageFrom includes .d.ts files inflating counts — confirm `!lib/**/*.d.ts` exclusion

**Sanity gate:** ALL 12 sanity checks must pass. Any failure blocks progression to Phase 59.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.

### No Proxy Metrics

**Rationale:** Phase 58 is a toolchain infrastructure phase with binary success criteria. Every meaningful
evaluation question is directly answerable via the sanity checks above:

- "Does TypeScript work?" — S4 (tsc --noEmit) answers this directly, not indirectly.
- "Is ESLint configured?" — S9/S10 answer this directly.
- "Does ts-jest work?" — S11/S12 answer this directly.
- "Are existing tests broken?" — S7/S12 answer this directly.

There is no quality dimension that requires indirect approximation. This is not a modeling or algorithm
phase where proxy metrics bridge the gap between measurable and non-measurable properties. The
toolchain either works or it does not, and all working/not-working questions are directly verifiable
in-phase.

**Recommendation:** Rely entirely on sanity checks (Level 1). The single deferred validation below
covers the one genuinely out-of-scope question for this phase.

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration not available in Phase 58.

### D1: Strict Mode Compatibility with Full Codebase — DEFER-58-01
- **What:** Whether `strict: true` in tsconfig.json raises errors across all 23 lib/ modules and 4 bin/ entry points when they are migrated to .ts in Phases 59–63
- **How:** Run `tsc --noEmit` across all migrated .ts files and count zero-error completion across the entire codebase
- **Why deferred:** Only lib/sample.ts exists as a .ts file in Phase 58. Whether strict mode settings are compatible with real codebase patterns (implicit any, optional chaining, type narrowing gaps, null handling) cannot be verified until real modules are migrated. The sample file is authored to be strict-compliant by design.
- **Validates at:** Phase 65 (Integration Validation & Documentation)
- **Depends on:** All lib/*.ts and bin/*.ts files migrated in Phases 59–63; full `tsc --noEmit` across the complete source set
- **Target:** `tsc --noEmit` exits 0 with zero errors across all .ts files; zero `any` types in core lib/ modules (REQ-78)
- **Risk if unmet:** Strict mode violations discovered at Phase 65 require either (a) retrofitting type fixes across all modules — budget 1–2 additional phases; (b) weakening strict settings on a per-module basis — acceptable only for external API boundaries with documented justification. Risk is LOW because each migration phase (59–63) runs `tsc --noEmit` as a sanity check per module, catching issues early.
- **Fallback:** If specific modules cannot satisfy strict mode, enable `// @ts-strict-mode` per-file with documented exceptions rather than weakening the global tsconfig

## Ablation Plan

**No ablation plan** — Phase 58 implements three sequential infrastructure sub-plans (tsconfig, ESLint,
ts-jest), each independently verifiable. There are no sub-components to ablate. Each plan is either
present and working or absent.

If any single plan is reverted or fails, the corresponding sanity checks (S1–S7 for plan 01, S8–S10
for plan 02, S11–S12 for plan 03) isolate the failure exactly.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. Phase 58 modifies only
`tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `jest.config.js`, `package.json`,
`lib/sample.ts`, and `tests/unit/sample.test.ts`. No HTML, JSX, TSX, Vue, Svelte, CSS, or frontend
route files are modified.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Total test count | Pre-Phase 58 passing tests | 2,184 (must not decrease) | STATE.md performance metrics |
| ESLint clean | Existing JS files produce zero errors | 0 errors | Pre-Phase eslint.config.js |
| Per-file coverage (22 modules) | All 22 lib/*.js files meet per-file thresholds | All thresholds met | jest.config.js (lines 8–29) |
| npm test exit code | Pre-Phase 58 baseline | Exit 0 | Continuous in all prior phases |

## Evaluation Scripts

**Location of evaluation code:** No dedicated evaluation scripts required — all checks use npm scripts
and npx invocations already defined in the plan. All commands are specified in the sanity checks above.

**How to run all sanity checks sequentially:**
```bash
# Wave 1: TypeScript compilation
npx tsc --version
node -e "const c=JSON.parse(require('fs').readFileSync('tsconfig.json','utf8')); console.log('strict:', c.compilerOptions.strict, 'module:', c.compilerOptions.module, 'noEmit:', c.compilerOptions.noEmit)"
node -e "const c=JSON.parse(require('fs').readFileSync('tsconfig.build.json','utf8')); console.log('extends:', c.extends, 'outDir:', c.compilerOptions.outDir, 'noEmit:', c.compilerOptions.noEmit)"
npm run build:check
npm run build && ls /Users/neo/Developer/Projects/GetResearchDone/dist/lib/sample.js /Users/neo/Developer/Projects/GetResearchDone/dist/lib/sample.d.ts /Users/neo/Developer/Projects/GetResearchDone/dist/lib/sample.js.map /Users/neo/Developer/Projects/GetResearchDone/dist/lib/sample.d.ts.map
node -e "const p=require('./package.json'); console.log('build:', p.scripts.build, 'build:check:', p.scripts['build:check'])"
npm test

# Wave 2: ESLint
node -e "const c = require('./eslint.config.js'); console.log('configs:', c.length, 'loaded OK')"
npx eslint lib/sample.ts
npm run lint

# Wave 2: ts-jest
npx jest tests/unit/sample.test.ts --verbose
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: tsc --version | | | |
| S2: tsconfig.json strict+module | | | |
| S3: tsconfig.build.json extends+outDir | | | |
| S4: npm run build:check | | | |
| S5: dist/ artifacts present | | | |
| S6: build scripts in package.json | | | |
| S7: npm test (2,184 JS tests) | | | |
| S8: eslint.config.js loads | | | |
| S9: eslint lib/sample.ts | | | |
| S10: npm run lint (all JS+TS) | | | |
| S11: jest sample.test.ts | | | |
| S12: npm test (full suite + coverage) | | | |

### Proxy Results

None — no proxy metrics designed for this phase (see rationale above).

### Ablation Results

None — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-58-01 | Strict mode compatibility with full codebase | PENDING | Phase 65 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — all 12 checks are deterministic, binary-outcome tests with exact commands.
  Every success criterion from REQ-62, REQ-63, and the ROADMAP.md phase definition is covered by at
  least one sanity check. No important question is left unmeasured.
- Proxy metrics: None needed — infrastructure toolchain phases do not benefit from indirect measurement.
  The absence of proxy metrics reflects honest assessment, not incomplete evaluation design.
- Deferred coverage: Comprehensive for what this phase can defer. The one deferred item (DEFER-58-01)
  accurately captures the only question that cannot be answered in Phase 58: whether the tsconfig
  settings work across the full future TypeScript codebase.

**What this evaluation CAN tell us:**
- Whether TypeScript is correctly installed and configured with strict mode and CommonJS output
- Whether the ESLint configuration correctly handles both .js and .ts files without regressions
- Whether ts-jest correctly compiles and runs TypeScript test files with coverage
- Whether all 2,184 existing JavaScript tests continue to pass without modification
- Whether the dist/ build output is structurally correct (declarations, source maps, CommonJS format)

**What this evaluation CANNOT tell us:**
- Whether strict mode settings will cause errors in real lib/*.ts migrations (deferred to Phase 65 via DEFER-58-01)
- Whether the CommonJS interop works for all 20+ downstream lib/ consumers importing from migrated modules (deferred to Phase 65 via Phase 59's DEFER-59-01, not Phase 58's concern)
- Whether the compiled dist/ output is functionally equivalent to the source JS for real CLI invocations (deferred to Phase 65 — Phase 58 only verifies dist/ structure, not runtime equivalence)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-02*
