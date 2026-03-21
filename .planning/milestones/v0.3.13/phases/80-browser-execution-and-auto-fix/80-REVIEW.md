---
phase: 80-browser-execution-and-auto-fix
wave: all
plans_reviewed: [80-01, 80-02, 80-03]
timestamp: 2026-03-21T07:03:14Z
blockers: 1
warnings: 1
info: 2
verdict: blocker_found
---

# Code Review: Phase 80 — Browser Execution and Auto-Fix

## Verdict: BLOCKERS FOUND

Phase 80 is functionally complete and architecturally sound. All three plans were executed with correct implementations, TypeScript compiles cleanly, and the wireup pipeline is fully wired. One blocker exists: the `detectPlaywright()` addition to `lib/backend.ts` drops that file below its mandatory per-file coverage thresholds in `jest.config.js`, which will cause `npm test` to fail. This must be resolved before phase 81 proceeds.

---

## Stage 1: Spec Compliance

### Plan Alignment

All plan tasks were executed. Commits referenced in each SUMMARY.md exist and contain the claimed changes.

| Plan | Tasks | Commits | Status |
|------|-------|---------|--------|
| 80-01 | 2 / 2 | e6e6ef2, bbe28ec | Complete |
| 80-02 | 1 / 1 | 04a3b69 | Complete |
| 80-03 | 2 / 2 | 7a5b8e5, 3960215 | Complete |

The 80-02 SUMMARY.md correctly documents one deviation: `FixAttempt` and `AutoFixResult` types were pre-staged in commit `bbe28ec` (80-01) rather than in 80-02's commit. The deviation is transparently explained under "Note on Pre-staged Work". The IssueType extension (`missing-export`) was a real bug fix caught during TypeScript compilation — also properly documented.

The 80-03 SUMMARY notes one minor structural decision: `WireupReportData` was defined in `report.ts` rather than `types.ts`, with a documented rationale (report-module-specific). This is acceptable.

No plan task was skipped or left unimplemented.

### Research Methodology

N/A — Phase 80 implements GRD-internal wireup infrastructure with no external research references or paper implementations.

### Context Decision Compliance

No CONTEXT.md exists for phase 80. No locked decisions to verify.

### Known Pitfalls

N/A — No KNOWHOW.md exists in the research directory for this milestone.

### Eval Coverage

An EVAL.md exists for phase 80 (committed as `docs(phase-80): evaluation plan with tiered verification`). The evaluation criteria map to proxy-level checks that were verified during execution (TypeScript compile, function runtime, iteration history append). The deferred Level 3 (live Playwright MCP scenario execution) is documented as deferred in the 80-03 SUMMARY, consistent with the plan's own Level 3 deferral note.

---

## Stage 2: Code Quality

### Architecture Consistency

New code follows established project patterns throughout:

- `'use strict'` at top of both new files (`autofix.ts`, `report.ts`).
- `import type` used for type-only imports, consistent with the entire `lib/wireup/` subdirectory.
- Typed `require()` used for value imports — no plain `require` without type annotation.
- Zero `any` types. `Record<string, unknown>` used where untyped JSON is read.
- `detectPlaywright()` mirrors `detectWebMcp()` waterfall structure exactly (config -> env -> mcp-config -> default), consistent with the detection pattern established in `lib/backend.ts`.
- `WIREUP_FIX_MODEL` aliases `SONNET_MODEL` from `./state` — not redeclared. Model ceiling constraint honored.
- `lib/wireup/index.ts` barrel re-exports all new public functions. Consumers of the `lib/wireup` module have a single import point.
- `currentMilestone()` from `lib/paths.ts` used for path resolution in `report.ts` — consistent with how other milestone-scoped paths are built in the codebase.

### Reproducibility

N/A — Phase 80 is infrastructure code, not experimental or ML code. No seed or determinism requirements apply.

### Documentation

Documentation quality is good across all three plans:

- `autofix.ts` module header explains the delegation model (fix application is not spawned directly) and the model ceiling constraint.
- `executeBrowserScenario()` and `generateManualSteps()` include JSDoc with parameter and return type descriptions.
- The browser step action mapping (`navigate -> browser_navigate`, etc.) is documented inline in `execution.ts`.
- `extractIterationHistory()` and the iteration-history append logic in `report.ts` are commented to explain the preserve-and-append pattern.

No paper references needed (no research technique implementations).

### Deviation Documentation

The 80-02 commit message for `04a3b69` is slightly inaccurate: it lists "Add FixAttempt and AutoFixResult types to lib/wireup/types.ts" as work done in that commit, but `git show 04a3b69 --name-only` shows only `lib/wireup/autofix.ts` and `lib/wireup/orchestrator.ts` were modified. Those types were actually committed in `bbe28ec` (80-01). The discrepancy is acknowledged in the 80-02 SUMMARY.md under "Note on Pre-staged Work" — the SUMMARY is accurate. Only the commit message itself misleads. This is a documentation issue, not a functional problem.

---

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | BLOCKER | 2 | Coverage | `lib/backend.ts` coverage thresholds violated: lines 83.43% (threshold 95%), functions 88.88% (threshold 100%), branches 75.44% (threshold 87%). `detectPlaywright()` (lines 661–715) has zero test coverage. `npm test` will fail. |
| 2 | WARNING | 2 | Deviation Documentation | Commit `04a3b69` message claims to add `FixAttempt`/`AutoFixResult` types to `lib/wireup/types.ts`, but those types were committed in `bbe28ec` (80-01). SUMMARY.md is accurate; commit message is not. |
| 3 | INFO | 2 | Architecture | `lib/wireup/autofix.ts` and `lib/wireup/report.ts` have no per-file coverage thresholds in `jest.config.js`. The existing wireup test files (`wireup-state.test.ts`, `wireup-discovery.test.ts`, `wireup-scenarios.test.ts`) show the pattern for adding thresholds when wireup modules reach stable coverage. Consider adding thresholds for the new modules in a follow-on plan. |
| 4 | INFO | 1 | Plan Alignment | 80-02 SUMMARY documents a real pre-staged-work deviation cleanly. This is good practice — noting it as an INFO for awareness, not a concern. |

---

## Recommendations

### BLOCKER 1 — Restore lib/backend.ts coverage

Add unit tests for `detectPlaywright()` to `tests/unit/backend.test.ts` following the existing `detectWebMcp()` test block (lines 911–1044 of that file). The four waterfall branches require:

1. Config override `playwright.enabled: true` — returns `{ available: true, source: 'config' }`.
2. Config override `playwright.enabled: false` — returns `{ available: false, source: 'config', reason: ... }`.
3. `PLAYWRIGHT_AVAILABLE=true` env var — returns `{ available: true, source: 'env' }`.
4. `PLAYWRIGHT_AVAILABLE=false` env var — returns `{ available: false, source: 'env', reason: ... }`.
5. `~/.claude.json` with a playwright-named MCP server key — returns `{ available: true, source: 'mcp-config' }`.
6. No config, no env, no MCP config — returns `{ available: false, source: 'default', reason: ... }`.

This mirrors the existing detectWebMcp test suite exactly. Once these tests are added, `npm test` should restore the thresholds. The new test commit should reference the 80-01 plan that introduced the function.

### WARNING 2 — Commit message accuracy

No code change needed. For future plans: when pre-staged work from a prior plan's commit is incorporated into a later plan's task, the commit message should omit claiming authorship of those types. The SUMMARY deviation note is the correct place to document this. Commit messages should reflect only what the diff actually contains.
