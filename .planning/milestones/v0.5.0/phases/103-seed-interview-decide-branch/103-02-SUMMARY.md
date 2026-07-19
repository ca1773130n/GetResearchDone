---
phase: 103-seed-interview-decide-branch
plan: 02
subsystem: research/orchestrator
tags: [interactive-steering, seed-clarification, checkpoints, REQ-203]
requires:
  - lib/research/checkpoints.ts (emitCheckpoint/consumeAnswered/makeCheckpointId/resolveInteractive)
  - lib/research/agent-io.ts (extractTaggedJson)
provides:
  - lib/research/agent-io.ts:parseClarifyOutput
  - lib/research/_prompts.ts:buildClarifyPrompt
  - lib/research/orchestrator.ts SEED station (resolveSeedPosture/buildSeedCheckpoint/fold)
  - thread.refinedQuestion is now READ (effectiveQuestion) — previously defined-but-unused
affects:
  - lib/research/orchestrator.ts HYPOTHESIZE grounding (effectiveQuestion)
tech-stack:
  patterns:
    - "Copied Phase 102 DESIGN emit/consume pattern verbatim to a SEED station"
key-files:
  created: []
  modified:
    - lib/research/agent-io.ts
    - lib/research/_prompts.ts
    - lib/research/orchestrator.ts
    - tests/unit/research/agent-io.test.ts
    - tests/unit/research/orchestrator.test.ts
decisions:
  - "SEED once-per-thread marker is refinedQuestion===undefined; zero-dimension path sets it to thread.question verbatim"
  - "parseClarifyOutput never returns null (always {dimensions:[]}); a null spawnAndParse value therefore means a hard spawn failure — degrade to zero dimensions"
  - "thread.question NEVER mutated (it seeds threadId); grounding uses effectiveQuestion = refinedQuestion ?? question"
metrics:
  tasks: 3
  duration_min: 18
  completed: 2026-07-19
---

# Phase 103 Plan 02: SEED Interview Orchestrator Clarify Checkpoint Summary

Bare-`gd`-CLI users now get the same SEED clarification the skill layer gives interactive
users: a thin orchestrator-side station that spawns a clarifier, parses its `__CLARIFY__`
block, and — only when ambiguous dimensions exist and `interactive.seed` is active — emits a
`point:'seed', type:'clarification'` checkpoint BEFORE HYPOTHESIZE. Answers fold into
`thread.refinedQuestion`; `thread.question` stays verbatim. Zero ambiguous dimensions cost one
spawn and zero pauses; the default-config flow is byte-identical to pre-103.

## What was built

- **`parseClarifyOutput(stdout)`** (agent-io.ts) — reuses `extractTaggedJson<T>(stdout,'CLARIFY')`.
  Normalizes defensively: missing/empty/malformed block or missing `dimensions` array →
  `{ dimensions: [] }`; caps at 4 dimensions; drops dimensions with no usable options; guarantees
  exactly one `recommended` option per surviving dimension (auto-marks the first when none/many).
- **`buildClarifyPrompt(thread)`** (_prompts.ts) — grd-hypothesizer SEED-clarify prompt; instructs
  the agent to surface ONLY genuinely ambiguous, metric-blocking dimensions, else emit an empty
  array. Single `__CLARIFY__` block contract.
- **SEED station** (orchestrator.ts) — `resolveSeedPosture` (mirrors `resolveDesignPosture`),
  `buildSeedCheckpoint`, and `foldSeedAnswers`, wired at loop top guarded by
  `designResolution === null`, after design-consume/abort, before the `let hyp; let plan;` tree.
  CONSUME (`consumeAnswered(...,'seed',...)`) → fold into `refinedQuestion`; else if
  `seedPosture.active` → spawn clarifier → zero dims sets `refinedQuestion = question` (no pause),
  ≥1 dim emits + pauses. HYPOTHESIZE grounds on `effectiveQuestion = refinedQuestion ?? question`.

## Verification results

| Level | Check | Result |
|-------|-------|--------|
| 1 Sanity | `tsc --noEmit` (strict, zero any) | PASS |
| 1 Sanity | `eslint lib/research/*` | PASS |
| 1 Sanity | parser tests (6 new) | PASS |
| 2 Proxy | SEED checkpoint tests (6 new) | PASS |
| 2 Proxy | full orchestrator + agent-io suites (87 tests) | PASS |

Coverage (post-change): agent-io.ts 94.18% stmts / 91.95% branch; orchestrator.ts 93.57% /
80.53%; _prompts.ts 100% / 73.33% — per-file jest thresholds hold (no threshold failures).

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| clarifier agentType | grd-hypothesizer (disambiguated by `__CLARIFY__` in prompt) |
| dimensions cap | 4 |
| seed rounds | 1 (single round) |
| once-per-thread marker | refinedQuestion === undefined |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| SEED behaviors proven offline | Phase 102 DESIGN pattern | all 6 pass | 6/6 | PASS |
| byte-identical default flow | pre-103 | no clarifier spawn / no refinedQuestion | verified | PASS |
| zero double-ask on resume | — | 1 seed resolve, no re-emit | verified | PASS |

### Analysis

The six locked behaviors are proven deterministically offline (injected spawn + runner, no
network): ambiguous → pause-before-HYPOTHESIZE with `point:'seed'` and zero hypothesizer spawns;
resume → `refinedQuestion` folds the chosen labels while `question` stays verbatim and grounding
uses the refined text; unambiguous → one clarifier spawn, no pause, `refinedQuestion === question`;
seeded threads skip SEED; interactive-off is byte-identical; and `consumeAnswered`'s one-shot guard
plus the `refinedQuestion !== undefined` posture gate prevent any double-ask.

## Deviations from Plan

None — plan executed exactly as written. TDD followed for Task 1 (parser tests RED before GREEN).

## Coordination notes

- Did NOT touch `commands/research.md` (owned by parallel plan 103-01).
- Staged only own files individually; no `git add .`.

## Self-Check: PASSED

All modified files present; all three task commits (fa17105, b42066c, b4a675d) exist.
