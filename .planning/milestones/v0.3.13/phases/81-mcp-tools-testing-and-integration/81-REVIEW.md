---
phase: 81-mcp-tools-testing-and-integration
wave: all
plans_reviewed: [81-01, 81-02, 81-03]
timestamp: 2026-03-21T07:57:31Z
blockers: 0
warnings: 1
info: 2
verdict: warnings_only
---

# Code Review: Phase 81 — MCP Tools, Testing, and Integration

## Verdict: WARNINGS ONLY

All three plans executed successfully with correct artifacts and test results. One lint error in `lib/wireup/cli.ts` (unused import) requires resolution before the next CI gate.

---

## Stage 1: Spec Compliance

### Plan Alignment

**81-01:** All three tasks completed with commits f2f802a, adc570c, bbcc285.

- Task 0 (lib/wireup/cli.ts — five cmd wrappers): COMPLETE. Five functions present: `cmdWireupDiscover`, `cmdWireupRun`, `cmdWireupState`, `cmdWireupScenarios`, `cmdWireupReport`. All re-exported via `lib/wireup/index.ts` barrel.
- Task 1 (mcp-server.ts — wireup tool registrations): COMPLETE. All five tool names (`grd_wireup_discover`, `grd_wireup_run`, `grd_wireup_state`, `grd_wireup_scenarios`, `grd_wireup_report`) confirmed in COMMAND_DESCRIPTORS at lines 2588–2633.
- Task 2 (jest.config.js — coverage threshold): COMPLETE. `./lib/wireup/index.ts: { lines: 85, functions: 85, branches: 70 }` confirmed at line 37, correctly placed between `verify.ts` and `overstory.ts`.

Documented deviation: Field name mismatch auto-fixed during Task 0 (used actual types.ts fields `suggestedAction`, `feature.functionName`, `feature.filePath`, `test_data_fixture` instead of assumed names). Properly documented.

**81-02:** Two commits (dcaa29f, 618c9ee). Test file `tests/unit/wireup.test.ts` created at 2460 lines (plan required 200+). 151 tests. Coverage 87.1% overall, exceeding the 85% target.

- cli.ts line coverage at 15.87% is below the 85% threshold but the threshold key is `./lib/wireup/index.ts` (the barrel), not `./lib/wireup/cli.ts`. cli.ts has no dedicated coverage threshold entry, so this does not fail the gate. The SUMMARY correctly notes cli.ts is excluded from the 85% target because its functions are thin wrappers that call `output()` → `process.exit()`.
- All other wireup modules meet or exceed 85%.

**81-03:** Single commit (55bb133). Test file `tests/integration/wireup-e2e.test.ts` created at 467 lines (plan required 100+). 15 tests in 4 suites, all passing. Full npm test: 3353 tests, 54 suites, 0 failures per SUMMARY.

Three auto-fixed deviations properly documented: `scenario_id` field correction, dry-run early-return state test redesign, and `process.exit` mock type signature fix.

### Research Methodology

N/A — no research references in plans. Phase 81 is integration/testing work, not research implementation.

### Context Decision Compliance

No CONTEXT.md exists for phase 81. No locked decisions to verify.

### Known Pitfalls

No KNOWHOW.md in project root or research directory with wireup-specific pitfalls. N/A.

### Eval Coverage

EVAL.md defines five sanity checks (S1–S5), four proxy metrics (P1–P4), and two deferred validations (D1–D2).

- S1 (TypeScript compiles): PASS — `npm run build:check` exits 0.
- S2 (five tool names in mcp-server.ts): PASS — grep count 5 confirmed.
- S3 (five cmd wrappers in cli.ts): PASS — grep count confirmed.
- S4 (coverage threshold in jest.config.js): PASS — value confirmed as `{"lines":85,"functions":85,"branches":70}`.
- S5 (ESLint passes): FAIL — one lint error in `lib/wireup/cli.ts`. See WARNING below.
- P1 (unit tests pass): PASS — 151/151.
- P2 (coverage >= 85%): PASS — 87.1%.
- P3 (integration tests pass): PASS — 15/15.
- P4 (grd_wireup_run returns structured JSON): PASS — confirmed by integration test assertions.

Deferred items D1 and D2 are properly scoped to future milestones.

---

## Stage 2: Code Quality

### Architecture Consistency

The wireup MCP tool registration in `lib/mcp-server.ts` follows the existing evolve tool section pattern (typed require block, named section comment, CommandDescriptor entries with name/description/params/execute). Structure is consistent.

`lib/wireup/cli.ts` follows the `lib/evolve/cli.ts` pattern: `'use strict'`, CommonJS typed requires, no `any`, `_` prefix on unused parameters where applicable (e.g., `_args` in functions that do not use args). Barrel re-export structure in `lib/wireup/index.ts` is consistent with `lib/evolve/index.ts`.

Test files follow existing patterns: fixture builder functions, jest.mock at file level for subprocess prevention, beforeEach/afterEach temp directory lifecycle, assertion specificity consistent with evolve.test.ts precedent.

### Reproducibility

N/A — Phase 81 implements integration wiring and tests, not experimental code. No random seeds or config externalization concerns apply.

### Documentation

`lib/wireup/cli.ts` includes a module-level JSDoc comment listing all six exported functions and their dependencies. The five cmd functions are straightforward wrappers — no complex algorithmic logic requiring paper references. Documentation is adequate for the complexity level.

### Deviation Documentation

All deviations are documented in SUMMARY files:
- 81-01: One auto-fixed bug (wrong field names from types.ts).
- 81-02: Two auto-fixed bugs (direct import for coverage boost, mockOutput process.exit pattern).
- 81-03: Three auto-fixed bugs (scenario_id field, dry-run state test redesign, process.exit type signature).

All deviations are Rule 1 (bug fix) or Rule 2 (missing functionality), properly categorized. Commits match SUMMARY claims.

SUMMARY note that the 81-01 coverage threshold was placed "between `verify.ts` and `overstory.ts`" while the PLAN said "between `verify.ts` and `worktree.ts`" — both are accurate descriptions of the same position in the ordered list. No discrepancy.

---

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | `lib/wireup/cli.ts` imports `wireupStatePath` from `./state` (line 29) but never uses it in the file body — causes `npm run lint` to fail with `@typescript-eslint/no-unused-vars`. Pre-commit hook catches this; the commit must have bypassed or the error was introduced after the final commit. |
| 2 | INFO | 1 | Plan Alignment | `lib/wireup/cli.ts` line coverage is 15.87% (well below 85%), but there is no per-file threshold for `./lib/wireup/cli.ts` in jest.config.js. The SUMMARY justifies this (thin wrappers calling process.exit). The gap is intentional and documented, but adding a lower threshold (e.g., lines: 15) would make the intent explicit and prevent silent regression. |
| 3 | INFO | 1 | Eval Coverage | DEFER-81-01 and DEFER-81-02 correctly scoped to future milestones. The fixture-based discovery tests (planted features) do not validate precision/recall on organic codebases — this known limitation is properly documented in EVAL.md and poses no immediate blocker. |

---

## Recommendations

### WARNING 1 — Unused import in lib/wireup/cli.ts

Remove `wireupStatePath` from the require block at lines 29 and 33 of `lib/wireup/cli.ts`. The function is imported from `./state` but never called. This causes `npm run lint` to fail (ESLint `@typescript-eslint/no-unused-vars`), which will block the pre-commit hook on the next commit touching this file.

Fix:
```typescript
const {
  SONNET_MODEL,
  readWireupState,
}: {
  SONNET_MODEL: string;
  readWireupState: (cwd: string) => WireupState | null;
} = require('./state');
```

### INFO 2 — Consider explicit coverage floor for lib/wireup/cli.ts

The current jest.config.js only covers `./lib/wireup/index.ts` at 85%. Adding an explicit low-floor entry for `./lib/wireup/cli.ts` (e.g., `{ lines: 15, functions: 80, branches: 50 }`) would make the intentional exclusion of CLI wrappers from the 85% target explicit in config, preventing silent regression if cli.ts grows non-trivial logic.

### INFO 3 — Deferred validations tracking

DEFER-81-01 (real-project discovery fidelity) and DEFER-81-02 (live Playwright execution) are properly deferred to v0.3.14. Ensure these are tracked in ROADMAP.md deferred table before closing the v0.3.13 milestone.
