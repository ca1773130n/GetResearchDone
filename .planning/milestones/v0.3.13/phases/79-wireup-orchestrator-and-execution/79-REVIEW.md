---
phase: 79-wireup-orchestrator-and-execution
wave: all
plans_reviewed: [79-01, 79-02, 79-03]
timestamp: 2026-03-20T00:00:00Z
blockers: 0
warnings: 3
info: 4
verdict: warnings_only
---

# Code Review: Phase 79 — Wireup Orchestrator and Execution

## Verdict: WARNINGS ONLY

All three plans executed successfully. The core artifacts are correct, type-safe, and lint-clean. Three warnings are raised: an undocumented deviation from plan (missing `spawnClaudeAsync` import), an undocumented flag in the slash command, and a minor scenario identity concern. No blockers found.

---

## Stage 1: Spec Compliance

### Plan Alignment

**79-01 alignment:** Mostly complete. All required artifacts exist: `commands/wireup.md`, `lib/wireup/orchestrator.ts`, `lib/wireup/index.ts`, `lib/wireup/cli.ts`, routing in `bin/grd-tools.ts`, `cmdInitWireup` in `lib/context/index.ts`, `'wireup'` in `INIT_WORKFLOWS`. Two deviations are documented in the SUMMARY:

1. The `INIT_WORKFLOWS` gap was found and fixed (documented, commit `7d06409`).
2. Most 79-01 artifacts were committed as part of the 79-02 commit (`26d6c39`) — documented as a cross-plan commit ordering deviation.

One deviation is **not documented** in the SUMMARY: Plan 79-01 Task 2 specified that `lib/wireup/orchestrator.ts` should `"Import from ../autopilot: spawnClaudeAsync"` (the plan's key_links table lists `orchestrator.ts → autopilot.ts via spawnClaudeAsync`). The orchestrator does not import or use `spawnClaudeAsync` at all. Instead, SONNET_MODEL is passed via `ExecutionOptions.model` to the execution engine. This is a reasonable design decision but it is not documented as a deviation. See W1.

**79-02 alignment:** Complete. Both tasks implemented as specified. The `executeScenarios`, `executeHttpStep`, `executeCliStep` functions exist, types are defined, barrel is updated, and orchestrator integration is complete. The SONNET_MODEL unused-variable lint error and the commit ordering issue are documented.

**79-03 alignment:** Complete with no deviations. Detection engine implements all 6 heuristics, `MissingConnection` type has all required fields, orchestrator is fully integrated.

### Research Methodology

N/A — no research papers referenced. This phase implements an orchestration layer only.

### Context Decision Compliance

No CONTEXT.md for this phase. N/A.

### Known Pitfalls

No KNOWHOW.md in the research directory. N/A.

### Eval Coverage

The EVAL.md for phase 79 defines 9 sanity checks (S1–S9) and 8 proxy checks (P1–P8). Checking each:

- S1 (wireup.md frontmatter): PASS — `description:` present in frontmatter.
- S2 (orchestrator.ts non-empty): PASS — 348 lines.
- S3 (execution.ts non-empty): PASS — 359 lines.
- S4 (detection.ts non-empty): PASS — 505 lines.
- S5 (no opus in orchestrator): PASS — `grep -i 'opus'` returns no code matches.
- S6 (no LLM calls in detection): PASS — the only match is in a JSDoc comment (`* - NO LLM subprocess calls (no spawnClaude, no claude -p)`), not executable code.
- S7 (no external HTTP deps): PASS — no axios/node-fetch/got.
- S8 (npm run build:check): PASS — 0 type errors.
- S9 (npm run lint): PASS — 0 lint errors.

- P1 (SONNET_MODEL in spawnClaude calls): PASS with note — no actual `spawnClaudeAsync` calls exist in the orchestrator (only comment references). SONNET_MODEL is passed as `ExecutionOptions.model` to the execution engine. The metric is structurally satisfied.
- P2 (all 4 pipeline stages): PASS — `discoverUnwiredFeatures`, `generateScenarios`, `executeScenarios`, `detectMissingConnections` all found.
- P3 (ScenarioResult fields): PASS — `scenario_id`, `step_results`, `overall_passed` all present.
- P4 (MissingConnection fields): PASS — `issue_type`, `source_file`, `target_file`, `suggested_fix`, `confidence` all present.
- P5 (all 6 issue types): PASS — all 6 strings found in detection.ts.
- P6 (--target documented): PASS — `--target` present in wireup.md.
- P7 (barrel exports): PASS — `runWireup`, `cmdWireup`, `executeScenarios`, `detectMissingConnections` all in index.ts.
- P8 (wireup routing in grd-tools.ts): PASS — `'wireup'` routing present.

---

## Stage 2: Code Quality

### Architecture Consistency

The wireup subsystem follows the `lib/evolve/` pattern closely: `orchestrator.ts` + `cli.ts` context builder + barrel `index.ts`. CommonJS `require` with typed destructuring is used throughout. `'use strict'` is at the top of all new files. The `export function` syntax in `detection.ts` alongside `module.exports` at the end matches the established pattern in `lib/scheduler.ts`. No architectural conflicts found.

`lib/wireup/cli.ts` placement (rather than adding `cmdInitWireup` directly into `lib/context/agents.ts`) mirrors the `lib/evolve/cli.ts` placement — this is the correct and consistent choice.

### Reproducibility

N/A — no experimental/research code with random state. All wireup operations are deterministic filesystem operations.

### Documentation

Paper references are N/A. Inline documentation quality is high: all public functions have JSDoc with `@param`, `@returns`, and design constraint notes. The detection constraints (`NO LLM subprocess calls`) are explicitly documented in the module header. The model ceiling constraint is noted in both the orchestrator and `commands/wireup.md`.

One minor gap: the `--base-url` flag is implemented in `cmdWireup` and accepted by `executeScenarios`, but is not documented in `commands/wireup.md`. This was not in the original plan spec either. See W2.

### Deviation Documentation

**79-01:** The `spawnClaudeAsync` import deviation (plan specified it, implementation omits it) is not recorded in the SUMMARY deviations section. The deviation is sound architecturally — the model ceiling is enforced via `ExecutionOptions.model` instead — but it should have been documented. See W1.

**79-02:** Both deviations (SONNET_MODEL lint, commit ordering) are documented. The commit ordering deviation is notable: the 79-02 executor committed all 79-01 artifacts in commit `26d6c39`, meaning 79-01's SUMMARY lists only one commit (`7d06409`) even though its artifacts appear in a 79-02 commit. This is functionally fine but slightly misleads the commit→plan traceability. See W3.

**79-03:** No deviations. Summary matches git log exactly.

---

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | Plan 79-01 specified `spawnClaudeAsync` import from `../autopilot` as a key_link; orchestrator does not import it. Deviation is architecturally sound (SONNET_MODEL flows via ExecutionOptions.model) but is not documented in 79-01-SUMMARY.md deviations section. |
| 2 | WARNING | 2 | Documentation | `--base-url` flag implemented in `cmdWireup` and wired into `executeScenarios`, but not documented in `commands/wireup.md`. Callers have no discoverable way to know this flag exists without reading the source. |
| 3 | WARNING | 1 | Deviation Documentation | 79-02 committed all 79-01 plan artifacts in commit `26d6c39` (feat(79-02)), but 79-01-SUMMARY lists only `7d06409` under commits. The cross-plan commit is mentioned in the body text but not in a formal commits table. Future traceability queries against `git log --grep=79-01` will miss the bulk of 79-01's implementation. |
| 4 | INFO | 2 | Architecture | `WireupScenario` has no `scenario_id` field; `execution.ts` derives `scenario_id` and `feature_id` from `scenario.feature.functionName`. Two different features with the same function name would produce colliding IDs. Acceptable for current scope but worth noting for Phase 81 test fixture design. |
| 5 | INFO | 1 | Eval Coverage | EVAL.md P1 metric checks for `spawnClaude` calls referencing `SONNET_MODEL` but there are no actual `spawnClaude` calls in the orchestrator. The metric technically passes (vacuously) but the intent — verifying the model ceiling at real call sites — is deferred entirely to DEFER-79-03 in Phase 81. No action needed now. |
| 6 | INFO | 2 | Documentation | `detection.ts` uses both `export function` (on `classifyFailure` and `detectMissingConnections`) and `module.exports = { ... }` at the bottom. This is the same dual-export pattern used by `lib/scheduler.ts` and is intentional for TypeScript import type resolution. Consistent with the codebase pattern. |
| 7 | INFO | 2 | Architecture | `grepForPattern` in `detection.ts` defaults to `['--include=*.ts', '--include=*.js']` when no globs are provided. This means it won't scan `.tsx`/`.jsx` or config files by default during route/middleware lookups. For TypeScript React projects this could miss route registrations. Consider adding `*.tsx` to the default glob set in a future pass. |

---

## Recommendations

### W1 — Document spawnClaudeAsync deviation in 79-01-SUMMARY.md

Add a deviation entry to `79-01-SUMMARY.md` under "Deviations from Plan":

> **[Rule 2 - Plan deviation] spawnClaudeAsync not imported into orchestrator**
> Plan 79-01 Task 2 key_links specified `orchestrator.ts → autopilot.ts via spawnClaudeAsync`. The implemented orchestrator does not import `spawnClaudeAsync` because the orchestrator itself does not spawn any Claude subagents — execution is delegated entirely to `execution.ts`. SONNET_MODEL is propagated via `ExecutionOptions.model`. This is the correct architecture; the plan's key_link was aspirational rather than reflecting the actual design.

### W2 — Document --base-url in commands/wireup.md

Add a line to the Flags section:

```
- `--base-url <url>` — Base URL for HTTP scenario steps (default: http://localhost:3000)
```

### W3 — Add commits table to 79-01-SUMMARY.md

Append a commits table to `79-01-SUMMARY.md`:

```markdown
## Commits

| Hash | Description |
|------|-------------|
| 26d6c39 | feat(79-02): wire executeScenarios into orchestrator — includes 79-01 artifacts (wireup.md, cli.ts, orchestrator.ts, grd-tools routing, context registration) |
| 7d06409 | feat(79-01): add wireup to INIT_WORKFLOWS |
```

This makes it clear that the 79-01 artifacts are traceable to `26d6c39` even though the commit message says `79-02`.
